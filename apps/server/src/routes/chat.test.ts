import { simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import type { ChatContentEntry } from '../chat/content-log';
import type {
  ConversationDetail,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SaveResult,
} from '../persistence/ports';
import { ChatProviderUnconfiguredError } from '../models/registry';
import { createChatRoute } from './chat';
import { appWithMock, appWithSink, okModel, post, validBody } from './chat.testkit';

/** A valid short id the envelope schema accepts for `conversationId`. */
const CONV_ID = 'k7m-2qp';

/**
 * A multi-conversation fake: scripts `load` (the pre-flight read) and records every `saveTurn`.
 * Only the load/saveTurn paths matter here; the rest are inert stubs.
 */
function multiStoreFake(
  loadResult: ConversationDetail | null,
  saveResult: SaveResult = { ok: true, revision: 1 },
): MultiConversationStore & {
  saveTurnCalls: { id: string; baseRevision: number | undefined }[];
} {
  const saveTurnCalls: { id: string; baseRevision: number | undefined }[] = [];
  return {
    saveTurnCalls,
    list: async () => [],
    load: async () => loadResult,
    rename: async () => undefined,
    setPinned: async () => true,
    branch: async () => ({ ok: false, reason: 'not-found' }),
    delete: async () => undefined,
    deleteMany: async () => undefined,
    healMessages: async () => undefined,
    saveTurn: async (_owner, id, _messages, baseRevision) => {
      saveTurnCalls.push({ id, baseRevision });
      return saveResult;
    },
  };
}

/** A minimal text-only stream that emits `text` then a stop finish, for a mock `doStream`. */
function textStream(text: string) {
  return simulateReadableStream({
    chunks: [
      { type: 'text-start' as const, id: 't1' },
      { type: 'text-delta' as const, id: 't1', delta: text },
      { type: 'text-end' as const, id: 't1' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    ],
  });
}

describe('POST /api/v1/chat request handling', () => {
  it('streams the model response for a valid request', async () => {
    const res = await post(appWithMock(), validBody);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ok');
  });

  it('logs the user message content when logContent is on', async () => {
    const entries: ChatContentEntry[] = [];
    const res = await post(appWithSink(entries, true), validBody);
    await res.text();
    expect(entries).toContainEqual({ role: 'user', text: 'Hi' });
  });

  it('does not log content when logContent is off (default)', async () => {
    const entries: ChatContentEntry[] = [];
    const res = await post(appWithSink(entries, false), validBody);
    await res.text();
    expect(entries).toHaveLength(0);
  });

  it('returns a validation error for an empty messages array (envelope)', async () => {
    const res = await post(appWithMock(), { messages: [] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
  });

  it('returns a validation error for a malformed UIMessage (deep validation)', async () => {
    const res = await post(appWithMock(), { messages: [{ foo: 'bar' }] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('validation-error');
  });

  it('strips an errored turn (empty-parts assistant) so the next send is not rejected', async () => {
    const md = { createdAt: 1700000000000 };
    // An errored or aborted turn leaves an assistant message with empty parts; without stripping it,
    // the whole history would 400 ("Message must contain at least one part") and poison the chat.
    const res = await post(appWithMock(), {
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: md },
        { id: 'a1', role: 'assistant', parts: [], metadata: md },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'again' }], metadata: md },
      ],
    });
    expect(res.status).toBe(200);
  });

  it('returns unconfigured when the provider is not configured', async () => {
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => {
          throw new ChatProviderUnconfiguredError('Add a key in Settings.');
        },
      }),
    );
    const res = await post(app, validBody);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe('unconfigured');
  });

  it('passes the request modelId through to the resolver', async () => {
    const seen: string[] = [];
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: (modelId) => {
          seen.push(modelId);
          return Promise.resolve(okModel());
        },
      }),
    );
    const res = await post(app, { ...validBody, modelId: 'anthropic:claude-opus-4-5' });
    await res.text();
    expect(seen).toEqual(['anthropic:claude-opus-4-5']);
  });

  it('returns provider-error when model resolution fails unexpectedly', async () => {
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => {
          throw new Error('kaboom');
        },
      }),
    );
    const res = await post(app, validBody);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { code: string }).code).toBe('provider-error');
  });

  it('enables reasoning for a reasoning-capable model under a non-off global effort', async () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'medium',
      connections: [{ id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk' }],
    });
    let capturedOptions: unknown;
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        capturedOptions = options.providerOptions;
        return { stream: textStream('ok') };
      },
    });
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => ({ model, resolvedModelId: 'c:claude-sonnet-4-5', settings }),
      }),
    );
    const res = await post(app, { ...validBody, modelId: 'c:claude-sonnet-4-5' });
    await res.text();
    expect(capturedOptions).toMatchObject({ anthropic: { thinking: { type: 'enabled' } } });
  });

  it('sends no reasoning provider options when the global effort is off', async () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'off',
      connections: [{ id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk' }],
    });
    let capturedOptions: unknown = 'unset';
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        capturedOptions = options.providerOptions;
        return { stream: textStream('ok') };
      },
    });
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => ({ model, resolvedModelId: 'c:claude-sonnet-4-5', settings }),
      }),
    );
    const res = await post(app, { ...validBody, modelId: 'c:claude-sonnet-4-5' });
    await res.text();
    expect(capturedOptions).toBeUndefined();
  });

  it('persists by id via saveTurn when the request carries a conversationId (create on first send)', async () => {
    // First send: no baseRevision (no row yet). The store's load returns null, so no conflict; the
    // finished turn persists through saveTurn for THIS id, mirroring create-on-first-send.
    const store = multiStoreFake(null);
    const app = new Hono();
    app.route('/', createChatRoute({ resolveModel: okModel, multiConversationStore: store }));
    const res = await post(app, { ...validBody, conversationId: CONV_ID });
    await res.text(); // drain so onFinish/persist runs
    expect(store.saveTurnCalls).toHaveLength(1);
    expect(store.saveTurnCalls[0]?.id).toBe(CONV_ID);
    expect(store.saveTurnCalls[0]?.baseRevision).toBeUndefined();
  });

  it('returns 409 conflict JSON on a stale baseRevision WITHOUT resolving the model or streaming', async () => {
    // Stored revision is 5; the request bases on 3 (stale). The route must 409 BEFORE resolveModel -
    // proving no stream started - and return JSON, not an SSE error.
    let resolveCalls = 0;
    const detail: ConversationDetail = {
      messages: [],
      title: 't',
      reasoningOverride: null,
      modelId: null,
      revision: 5,
    };
    const store = multiStoreFake(detail);
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => {
          resolveCalls += 1;
          return okModel();
        },
        multiConversationStore: store,
      }),
    );
    const res = await post(app, { ...validBody, conversationId: CONV_ID, baseRevision: 3 });
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(((await res.json()) as { code: string }).code).toBe('conflict');
    expect(resolveCalls).toBe(0); // model never resolved, so no stream started.
    expect(store.saveTurnCalls).toHaveLength(0);
  });

  it('proceeds and streams when the baseRevision matches the stored revision', async () => {
    const detail: ConversationDetail = {
      messages: [],
      title: 't',
      reasoningOverride: null,
      modelId: null,
      revision: 3,
    };
    const store = multiStoreFake(detail);
    const app = new Hono();
    app.route('/', createChatRoute({ resolveModel: okModel, multiConversationStore: store }));
    const res = await post(app, { ...validBody, conversationId: CONV_ID, baseRevision: 3 });
    expect(res.status).toBe(200);
    await res.text();
    expect(store.saveTurnCalls[0]?.baseRevision).toBe(3);
  });

  it('an omitted conversationId stays ephemeral and never touches the id store', async () => {
    // The absent-conversationId path is ephemeral: no persistence call reaches the id-keyed store.
    const idStore = multiStoreFake(null);
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: okModel,
        multiConversationStore: idStore,
      }),
    );
    const res = await post(app, validBody); // no conversationId
    await res.text();
    expect(idStore.saveTurnCalls).toHaveLength(0);
  });

  it('reads the reasoning override by (owner, conversationId) when a conversationId is present', async () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'low',
      connections: [{ id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk' }],
    });
    let capturedOptions: unknown;
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        capturedOptions = options.providerOptions;
        return { stream: textStream('ok') };
      },
    });
    const seen: { owner: string; id: string }[] = [];
    const idReasoningOverrideStore: IdReasoningOverrideStore = {
      getReasoningOverride: async (owner, id) => {
        seen.push({ owner, id });
        return 'high' as const;
      },
      setReasoningOverride: async () => undefined,
    };
    const store = multiStoreFake(null);
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: () => ({ model, resolvedModelId: 'c:claude-sonnet-4-5', settings }),
        multiConversationStore: store,
        idReasoningOverrideStore,
      }),
    );
    const res = await post(app, {
      ...validBody,
      modelId: 'c:claude-sonnet-4-5',
      conversationId: CONV_ID,
    });
    await res.text();
    expect(seen).toEqual([{ owner: 'local', id: CONV_ID }]);
    // The id-keyed override (high) won the cascade over the global low effort.
    expect(capturedOptions).toMatchObject({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 16384 } },
    });
  });

  it('reads the model override by (owner, conversationId) and uses it OVER the request body modelId', async () => {
    const seenModelIds: string[] = [];
    const seenReads: { owner: string; id: string }[] = [];
    const idModelOverrideStore: IdModelOverrideStore = {
      getModelOverride: async (owner, id) => {
        seenReads.push({ owner, id });
        return 'stored:model';
      },
      setModelOverride: async () => undefined,
    };
    const store = multiStoreFake(null);
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: (modelId) => {
          seenModelIds.push(modelId);
          return Promise.resolve(okModel());
        },
        multiConversationStore: store,
        idModelOverrideStore,
      }),
    );
    const res = await post(app, { ...validBody, modelId: 'body:model', conversationId: CONV_ID });
    await res.text();
    // The DB override is authoritative: it selects the turn's model over the client's body modelId.
    expect(seenModelIds).toEqual(['stored:model']);
    expect(seenReads).toEqual([{ owner: 'local', id: CONV_ID }]);
  });

  it('falls back to the request body modelId when no stored model override exists (inheriting)', async () => {
    const seenModelIds: string[] = [];
    const idModelOverrideStore: IdModelOverrideStore = {
      getModelOverride: async () => null, // inheriting conversation: no per-conversation override
      setModelOverride: async () => undefined,
    };
    const store = multiStoreFake(null);
    const app = new Hono();
    app.route(
      '/',
      createChatRoute({
        resolveModel: (modelId) => {
          seenModelIds.push(modelId);
          return Promise.resolve(okModel());
        },
        multiConversationStore: store,
        idModelOverrideStore,
      }),
    );
    const res = await post(app, { ...validBody, modelId: 'body:model', conversationId: CONV_ID });
    await res.text();
    expect(seenModelIds).toEqual(['body:model']);
  });
});
