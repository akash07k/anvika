import { Hono } from 'hono';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import { serverLogger } from '../logging/logger';

import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import type {
  ActiveConversationStore,
  BranchResult,
  ConversationDetail,
  ConversationSummary,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SaveResult,
} from '../persistence/ports';
import { ChatProviderUnconfiguredError } from '../models/registry';
import { OWNER_LOCAL } from '../persistence/owner';
import { retitleConversation } from '../chat/retitle';
import type { ResolvedChatModel } from '../chat/resolve-model';
import { createConversationsRoute } from './conversations';

/** A valid short id for tests (the route validates `:id` and bodies against `ConversationIdSchema`). */
const ID_A = 'aaa-111';
const ID_B = 'bbb-222';
const ID_C = 'ccc-333';
const ID_D = 'ddd-444';
const ID_MISSING = 'zzz-999';

/**
 * An in-memory fake of the three id-keyed ports, backed by simple maps. It tracks every write so a
 * test can assert side-effects (no write on GET; recompute+write on delete; heal-on-read).
 */
class FakeStore
  implements
    MultiConversationStore,
    IdReasoningOverrideStore,
    IdModelOverrideStore,
    ActiveConversationStore
{
  private readonly rows = new Map<string, ConversationDetail & { updatedAt: number }>();
  private order: string[] = [];
  private active: string | null = null;
  public readonly healed: { id: string; messages: UIMessage[] }[] = [];
  public readonly turns: { id: string; messages: UIMessage[] }[] = [];
  public readonly activeWrites: (string | null)[] = [];
  public readonly overrideWrites: { id: string; value: ReasoningEffort | null }[] = [];
  public readonly modelOverrideWrites: { id: string; value: string | null }[] = [];
  public pinWrite: { owner: string; id: string; pinned: boolean } | null = null;
  public branchCall: {
    owner: string;
    sourceId: string;
    newId: string;
    throughIndex: number | undefined;
    baseRevision: number;
  } | null = null;
  private branchResult: BranchResult = {
    ok: true,
    summary: { id: ID_D, title: 'Branch', updatedAt: 0, pinnedAt: null, revision: 1 },
  };

  seed(id: string, detail: Partial<ConversationDetail> & { updatedAt?: number } = {}): this {
    this.rows.set(id, {
      messages: detail.messages ?? [],
      title: detail.title ?? 'Untitled',
      reasoningOverride: detail.reasoningOverride ?? null,
      modelId: detail.modelId ?? null,
      revision: detail.revision ?? 1,
      updatedAt: detail.updatedAt ?? 0,
    });
    // Keep `order` most-recently-updated first by re-sorting on updatedAt DESC.
    this.order = [...this.rows.keys()].toSorted(
      (a, b) => (this.rows.get(b)?.updatedAt ?? 0) - (this.rows.get(a)?.updatedAt ?? 0),
    );
    return this;
  }

  setActive(id: string | null): this {
    this.active = id;
    return this;
  }

  list(_owner: string): Promise<ConversationSummary[]> {
    return Promise.resolve(
      this.order.map((id) => {
        const row = this.rows.get(id);
        return {
          id,
          title: row?.title ?? '',
          updatedAt: row?.updatedAt ?? 0,
          pinnedAt: null,
          revision: row?.revision ?? 1,
        };
      }),
    );
  }

  load(_owner: string, id: string): Promise<ConversationDetail | null> {
    const row = this.rows.get(id);
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      messages: row.messages,
      title: row.title,
      reasoningOverride: row.reasoningOverride,
      modelId: row.modelId,
      revision: row.revision,
    });
  }

  saveTurn(_owner: string, id: string, messages: UIMessage[]): Promise<SaveResult> {
    this.turns.push({ id, messages });
    // Faithful to the Drizzle store: create a revision-1 row when absent (create-if-absent).
    if (!this.rows.has(id)) this.seed(id, { messages, revision: 1 });
    return Promise.resolve({ ok: true, revision: 1 });
  }

  rename(_owner: string, id: string, title: string): Promise<void> {
    const row = this.rows.get(id);
    if (row) row.title = title;
    return Promise.resolve();
  }

  setPinned(owner: string, id: string, pinned: boolean): Promise<boolean> {
    // Record the last call so endpoint tests can assert the (owner, id, pinned) it received.
    // Faithful to the transactional Drizzle store: report whether the row existed; never bumps
    // revision. An absent row updates nothing and returns false (the route 404s on that).
    this.pinWrite = { owner, id, pinned };
    return Promise.resolve(this.rows.has(id));
  }

  /** Stage the {@link BranchResult} the next `branch` call returns; chainable for test setup. */
  withBranchResult(result: BranchResult): this {
    this.branchResult = result;
    return this;
  }

  branch(
    owner: string,
    sourceId: string,
    newId: string,
    throughIndex: number | undefined,
    baseRevision: number,
  ): Promise<BranchResult> {
    // Record the call so endpoint tests can assert the exact (owner, ids, throughIndex, baseRevision).
    this.branchCall = { owner, sourceId, newId, throughIndex, baseRevision };
    return Promise.resolve(this.branchResult);
  }

  delete(_owner: string, id: string): Promise<void> {
    this.rows.delete(id);
    this.order = this.order.filter((x) => x !== id);
    return Promise.resolve();
  }

  deleteMany(_owner: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      this.rows.delete(id);
      this.order = this.order.filter((x) => x !== id);
    }
    return Promise.resolve();
  }

  healMessages(_owner: string, id: string, messages: UIMessage[]): Promise<void> {
    this.healed.push({ id, messages });
    const row = this.rows.get(id);
    if (row) row.messages = messages;
    return Promise.resolve();
  }

  getReasoningOverride(_owner: string, id: string): Promise<ReasoningEffort | null> {
    return Promise.resolve(this.rows.get(id)?.reasoningOverride ?? null);
  }

  setReasoningOverride(_owner: string, id: string, value: ReasoningEffort | null): Promise<void> {
    this.overrideWrites.push({ id, value });
    const row = this.rows.get(id);
    if (row) row.reasoningOverride = value;
    return Promise.resolve();
  }

  getModelOverride(_owner: string, id: string): Promise<string | null> {
    return Promise.resolve(this.rows.get(id)?.modelId ?? null);
  }

  setModelOverride(_owner: string, id: string, value: string | null): Promise<void> {
    this.modelOverrideWrites.push({ id, value });
    const row = this.rows.get(id);
    if (row) row.modelId = value;
    return Promise.resolve();
  }

  getActiveId(_owner: string): Promise<string | null> {
    return Promise.resolve(this.active);
  }

  setActiveId(_owner: string, id: string | null): Promise<void> {
    this.activeWrites.push(id);
    this.active = id;
    return Promise.resolve();
  }
}

function appWith(store: FakeStore) {
  return new Hono().route(
    '/',
    createConversationsRoute({
      conversationStore: store,
      reasoningOverrideStore: store,
      modelOverrideStore: store,
      activeStore: store,
    }),
  );
}

const validMessages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: { createdAt: 1 } },
] as UIMessage[];

describe('GET /api/v1/conversations', () => {
  it('returns the list and the stored activeId when the pointer is valid', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 2 })
      .seed(ID_B, { updatedAt: 1 })
      .setActive(ID_B);
    const res = await appWith(store).request('/api/v1/conversations');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { conversations: { id: string }[]; activeId: string | null };
    expect(body.conversations.map((c) => c.id)).toEqual([ID_A, ID_B]);
    expect(body.activeId).toBe(ID_B);
  });

  it('falls back to the most-recent id when the stored active points at a missing id, WITHOUT writing', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 2 })
      .seed(ID_B, { updatedAt: 1 })
      .setActive(ID_MISSING);
    const res = await appWith(store).request('/api/v1/conversations');
    const body = (await res.json()) as { activeId: string | null };
    expect(body.activeId).toBe(ID_A);
    expect(store.activeWrites).toHaveLength(0);
  });

  it('returns activeId null on an empty list', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations');
    const body = (await res.json()) as { conversations: unknown[]; activeId: string | null };
    expect(body.conversations).toHaveLength(0);
    expect(body.activeId).toBeNull();
  });
});

describe('GET /api/v1/conversations/:id', () => {
  it('returns the detail for a known id', async () => {
    const store = new FakeStore().seed(ID_A, {
      messages: validMessages,
      title: 'Hello',
      revision: 3,
    });
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[]; title: string; revision: number };
    expect(body.messages).toHaveLength(1);
    expect(body.title).toBe('Hello');
    expect(body.revision).toBe(3);
  });

  it('400 on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('404 on an unknown id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request(`/api/v1/conversations/${ID_MISSING}`);
    expect(res.status).toBe(404);
  });

  it('heals a blank id via healMessages (not saveTurn) on read', async () => {
    const blank = [
      {
        id: '',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hi' }],
        metadata: { createdAt: 1 },
      },
    ] as unknown as UIMessage[];
    const store = new FakeStore().seed(ID_A, { messages: blank });
    const app = new Hono().route(
      '/',
      createConversationsRoute({
        conversationStore: store,
        reasoningOverrideStore: store,
        activeStore: store,
        newId: () => 'healed-1',
      }),
    );
    const res = await app.request(`/api/v1/conversations/${ID_A}`);
    const body = (await res.json()) as { messages: UIMessage[] };
    expect(body.messages[0]?.id).toBe('healed-1');
    expect(store.healed).toHaveLength(1);
    expect(store.turns).toHaveLength(0);
  });
});

describe('PATCH /api/v1/conversations/:id (rename)', () => {
  it('renames and returns 204', async () => {
    const store = new FakeStore().seed(ID_A, { title: 'Old' });
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });
    expect(res.status).toBe(204);
  });

  it('400 validation-error on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/not-a-uuid', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
  });

  it('400 on a malformed body', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 on an unknown id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request(`/api/v1/conversations/${ID_MISSING}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/conversations/:id', () => {
  it('recomputes and writes the new active when the deleted one was active', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 3 })
      .seed(ID_B, { updatedAt: 2 })
      .setActive(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activeId: string | null };
    expect(body.activeId).toBe(ID_B);
    expect(store.activeWrites).toEqual([ID_B]);
  });

  it('leaves the active pointer untouched when deleting a non-active conversation', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 3 })
      .seed(ID_B, { updatedAt: 2 })
      .setActive(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_B}`, { method: 'DELETE' });
    const body = (await res.json()) as { activeId: string | null };
    expect(body.activeId).toBe(ID_A);
    expect(store.activeWrites).toHaveLength(0);
  });

  it('400 on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/bad', { method: 'DELETE' });
    expect(res.status).toBe(400);
  });

  it('404 on an unknown id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request(`/api/v1/conversations/${ID_MISSING}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/conversations/delete-batch', () => {
  it('deletes the known ids, ignores unknown ones, and reports the right deleted count', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 3 })
      .seed(ID_B, { updatedAt: 2 })
      .seed(ID_C, { updatedAt: 1 })
      .setActive(ID_C);
    const res = await appWith(store).request('/api/v1/conversations/delete-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [ID_A, ID_MISSING] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: number; activeId: string | null };
    expect(body.deleted).toBe(1);
    expect(body.activeId).toBe(ID_C);
    expect(store.activeWrites).toHaveLength(0);
  });

  it('recomputes the active when it is among the deleted ids', async () => {
    const store = new FakeStore()
      .seed(ID_A, { updatedAt: 3 })
      .seed(ID_B, { updatedAt: 2 })
      .setActive(ID_A);
    const res = await appWith(store).request('/api/v1/conversations/delete-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [ID_A] }),
    });
    const body = (await res.json()) as { deleted: number; activeId: string | null };
    expect(body.deleted).toBe(1);
    expect(body.activeId).toBe(ID_B);
    expect(store.activeWrites).toEqual([ID_B]);
  });

  it('400 on a malformed body', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/delete-batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: ['not-a-uuid'] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/v1/conversations/active', () => {
  it('sets the active pointer and returns 204', async () => {
    const store = new FakeStore().seed(ID_A).setActive(null);
    const res = await appWith(store).request('/api/v1/conversations/active', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: ID_A }),
    });
    expect(res.status).toBe(204);
    expect(store.activeWrites).toEqual([ID_A]);
  });

  it('404 when the id does not exist', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/active', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: ID_MISSING }),
    });
    expect(res.status).toBe(404);
  });

  it('400 on a malformed body', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/active', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
  });
});

/** Build an app whose retitle function returns `title` (or throws `err`), capturing the messages. */
function appWithRetitle(
  store: FakeStore,
  behavior: { title?: string; err?: unknown },
  seen?: { messages?: readonly UIMessage[] },
) {
  return new Hono().route(
    '/',
    createConversationsRoute({
      conversationStore: store,
      reasoningOverrideStore: store,
      activeStore: store,
      retitle: (messages) => {
        if (seen) seen.messages = messages;
        if (behavior.err) return Promise.reject(behavior.err);
        return Promise.resolve(behavior.title ?? 'New AI Title');
      },
    }),
  );
}

describe('POST /api/v1/conversations/:id/retitle', () => {
  it('returns 200 with the new title and persists it via rename', async () => {
    const store = new FakeStore().seed(ID_A, { messages: validMessages, title: 'Old' });
    const seen: { messages?: readonly UIMessage[] } = {};
    const res = await appWithRetitle(store, { title: 'Fresh Title' }, seen).request(
      `/api/v1/conversations/${ID_A}/retitle`,
      { method: 'POST' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe('Fresh Title');
    // Persisted via rename: the seeded conversation now carries the new title.
    const detail = await store.load('local', ID_A);
    expect(detail?.title).toBe('Fresh Title');
    // The handler supplied the conversation's messages to the retitle function.
    expect(seen.messages).toHaveLength(1);
  });

  it('404 when no retitle function is injected (optional-dep guard)', async () => {
    const store = new FakeStore().seed(ID_A, { messages: validMessages });
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/retitle`, {
      method: 'POST',
    });
    expect(res.status).toBe(404);
  });

  it('400 on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWithRetitle(store, { title: 'x' }).request(
      '/api/v1/conversations/bad/retitle',
      { method: 'POST' },
    );
    expect(res.status).toBe(400);
  });

  it('404 on an unknown id', async () => {
    const store = new FakeStore();
    const res = await appWithRetitle(store, { title: 'x' }).request(
      `/api/v1/conversations/${ID_MISSING}/retitle`,
      { method: 'POST' },
    );
    expect(res.status).toBe(404);
  });

  it('503 unconfigured when the retitle function throws ChatProviderUnconfiguredError', async () => {
    const store = new FakeStore().seed(ID_A, { messages: validMessages });
    const res = await appWithRetitle(store, {
      err: new ChatProviderUnconfiguredError('Add a key in Settings.'),
    }).request(`/api/v1/conversations/${ID_A}/retitle`, { method: 'POST' });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('unconfigured');
  });

  it('502 provider-error when the retitle function throws a non-unconfigured failure', async () => {
    const store = new FakeStore().seed(ID_A, { messages: validMessages });
    const res = await appWithRetitle(store, {
      err: new Error('upstream exploded'),
    }).request(`/api/v1/conversations/${ID_A}/retitle`, { method: 'POST' });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('provider-error');
  });

  it('200 with the derived fallback title when the model returns blank on an empty-messages draft', async () => {
    // The reasoning create-if-absent path can leave an empty-messages row. Wire the REAL retitle
    // through a mock model that returns blank text: the route must answer 200 with a non-empty title
    // (the messages-derived fallback), NOT a 500 from RetitleResultSchema rejecting an empty title.
    const store = new FakeStore().seed(ID_A, { messages: [] });
    const blankModel = new MockLanguageModelV3({
      doGenerate: () =>
        Promise.resolve({
          content: [{ type: 'text' as const, text: '   ' }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        }),
    });
    const app = new Hono().route(
      '/',
      createConversationsRoute({
        conversationStore: store,
        reasoningOverrideStore: store,
        activeStore: store,
        retitle: (messages) =>
          retitleConversation({
            messages,
            resolveModel: (): Promise<ResolvedChatModel> =>
              Promise.resolve({
                model: blankModel,
                resolvedModelId: 'c:mock',
                settings: {} as ResolvedChatModel['settings'],
              }),
          }),
      }),
    );
    const res = await app.request(`/api/v1/conversations/${ID_A}/retitle`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe('New conversation');
  });
});

describe('PATCH /api/v1/conversations/:id/reasoning', () => {
  it('sets the override and returns 204', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/reasoning`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'high' }),
    });
    expect(res.status).toBe(204);
    expect(store.overrideWrites).toEqual([{ id: ID_A, value: 'high' }]);
  });

  it('400 on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/bad/reasoning', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'high' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on a malformed body (inherit is rejected)', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/reasoning`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'inherit' }),
    });
    expect(res.status).toBe(400);
  });

  it('creates the row when set on a draft id (no existing row) and returns 204', async () => {
    const store = new FakeStore();
    const draftId = ID_MISSING;
    // Precondition: no row for the draft id yet.
    expect(await store.load('local', draftId)).toBeNull();
    const res = await appWith(store).request(`/api/v1/conversations/${draftId}/reasoning`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'high' }),
    });
    expect(res.status).toBe(204);
    // The row now exists with empty messages and the override set.
    const detail = await store.load('local', draftId);
    expect(detail).not.toBeNull();
    expect(detail?.messages).toHaveLength(0);
    expect(detail?.reasoningOverride).toBe('high');
  });

  it('logs a content-safe, use-case error and 500s when the override write fails', async () => {
    const store = new FakeStore().seed(ID_A);
    store.setReasoningOverride = () => Promise.reject(new Error('db down'));
    const errorSpy = vi.spyOn(serverLogger('conversation'), 'error');
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/reasoning`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'high' }),
    });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith('reasoning override write failed', {
      message: expect.any(String),
    });
    errorSpy.mockRestore();
  });
});

describe('PATCH /api/v1/conversations/:id/model', () => {
  it('sets the override and returns 204', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4o' }),
    });
    expect(res.status).toBe(204);
    expect(store.modelOverrideWrites).toEqual([{ id: ID_A, value: 'openai:gpt-4o' }]);
  });

  it('sets null to inherit and returns 204', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: null }),
    });
    expect(res.status).toBe(204);
    expect(store.modelOverrideWrites).toEqual([{ id: ID_A, value: null }]);
  });

  it('400 on a malformed :id', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/bad/model', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4o' }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on a malformed body (unknown key rejected by the strict object)', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4o', extra: 1 }),
    });
    expect(res.status).toBe(400);
  });

  it('400 on a non-string, non-null modelId', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 42 }),
    });
    expect(res.status).toBe(400);
  });

  it('creates the row when set on a draft id (no existing row) and returns 204', async () => {
    const store = new FakeStore();
    const draftId = ID_MISSING;
    expect(await store.load('local', draftId)).toBeNull();
    const res = await appWith(store).request(`/api/v1/conversations/${draftId}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4o' }),
    });
    expect(res.status).toBe(204);
    const detail = await store.load('local', draftId);
    expect(detail).not.toBeNull();
    expect(detail?.messages).toHaveLength(0);
    expect(detail?.modelId).toBe('openai:gpt-4o');
  });

  it('logs a content-safe, use-case error and 500s when the override write fails', async () => {
    const store = new FakeStore().seed(ID_A);
    // A persistence failure during the write must be surfaced as a use-case-specific error log
    // (not only the generic app.onError 500). The thrown error name/message is operational, never
    // user content.
    store.setModelOverride = () => Promise.reject(new Error('db down'));
    const errorSpy = vi.spyOn(serverLogger('conversation'), 'error');
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4o' }),
    });
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith('model override write failed', {
      message: expect.any(String),
    });
    errorSpy.mockRestore();
  });
});

describe('PUT /api/v1/conversations/:id/pin', () => {
  it('pins an existing conversation and returns 204, calling setPinned(OWNER_LOCAL, id, true)', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    });
    expect(res.status).toBe(204);
    expect(store.pinWrite).toEqual({ owner: OWNER_LOCAL, id: ID_A, pinned: true });
  });

  it('unpins an existing conversation and returns 204, recording pinned: false', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: false }),
    });
    expect(res.status).toBe(204);
    expect(store.pinWrite).toEqual({ owner: OWNER_LOCAL, id: ID_A, pinned: false });
  });

  it('400 with the validation-error code on a malformed body ({})', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
    expect(store.pinWrite).toBeNull();
  });

  it('400 when pinned is the wrong type ({ pinned: "x" })', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await appWith(store).request(`/api/v1/conversations/${ID_A}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('404 on an unknown id via the transactional setPinned (no separate load guard)', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request(`/api/v1/conversations/${ID_MISSING}/pin`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    });
    expect(res.status).toBe(404);
    // The route reached setPinned (which reported the row absent) rather than pre-loading to guard.
    expect(store.pinWrite).toEqual({ owner: OWNER_LOCAL, id: ID_MISSING, pinned: true });
  });

  it('400 on a structurally-invalid :id param', async () => {
    const store = new FakeStore();
    const res = await appWith(store).request('/api/v1/conversations/not-a-uuid/pin', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    });
    expect(res.status).toBe(400);
  });
});

/** Issue a `POST /:id/branch` against `store` with `body` and return the response. */
async function branchRequest(store: FakeStore, id: string, body: unknown): Promise<Response> {
  return appWith(store).request(`/api/v1/conversations/${id}/branch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/conversations/:id/branch', () => {
  it('200 with the new summary, calling branch(OWNER_LOCAL, id, newId, undefined, baseRevision)', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await branchRequest(store, ID_A, { newId: ID_B, baseRevision: 1 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: ID_D,
      title: 'Branch',
      updatedAt: 0,
      pinnedAt: null,
      revision: 1,
    });
    expect(store.branchCall).toEqual({
      owner: OWNER_LOCAL,
      sourceId: ID_A,
      newId: ID_B,
      throughIndex: undefined,
      baseRevision: 1,
    });
  });

  it('passes a provided throughIndex through to the store', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await branchRequest(store, ID_A, { newId: ID_B, throughIndex: 2, baseRevision: 3 });
    expect(res.status).toBe(200);
    expect(store.branchCall?.throughIndex).toBe(2);
    expect(store.branchCall?.baseRevision).toBe(3);
  });

  it('400 when the store reports a bad-index', async () => {
    const store = new FakeStore().seed(ID_A).withBranchResult({ ok: false, reason: 'bad-index' });
    const res = await branchRequest(store, ID_A, {
      newId: ID_B,
      throughIndex: 99,
      baseRevision: 1,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
  });

  it('409 with the conflict code on a stale baseRevision', async () => {
    const store = new FakeStore()
      .seed(ID_A)
      .withBranchResult({ ok: false, reason: 'conflict', currentRevision: 7 });
    const res = await branchRequest(store, ID_A, { newId: ID_B, baseRevision: 1 });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; details?: { currentRevision?: number } };
    expect(body.code).toBe('conflict');
    expect(body.details?.currentRevision).toBe(7);
  });

  it('409 on a newId collision', async () => {
    const store = new FakeStore().seed(ID_A).withBranchResult({ ok: false, reason: 'collision' });
    const res = await branchRequest(store, ID_A, { newId: ID_B, baseRevision: 1 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('conflict');
  });

  it('404 when the source is not found', async () => {
    const store = new FakeStore().seed(ID_A).withBranchResult({ ok: false, reason: 'not-found' });
    const res = await branchRequest(store, ID_A, { newId: ID_B, baseRevision: 1 });
    expect(res.status).toBe(404);
  });

  it('400 on a malformed body, before the store is called', async () => {
    const store = new FakeStore().seed(ID_A);
    const res = await branchRequest(store, ID_A, {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
    expect(store.branchCall).toBeNull();
  });

  it('400 on a structurally-invalid :id param', async () => {
    const store = new FakeStore();
    const res = await branchRequest(store, 'not-a-uuid', { newId: ID_B, baseRevision: 1 });
    expect(res.status).toBe(400);
  });

  it('404 when no conversation store is injected', async () => {
    const app = new Hono().route('/', createConversationsRoute({}));
    const res = await app.request(`/api/v1/conversations/${ID_A}/branch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newId: ID_B, baseRevision: 1 }),
    });
    expect(res.status).toBe(404);
  });
});
