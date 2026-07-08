import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import { serverLogger } from '../logging/logger';
import type { BranchResult, MultiConversationStore, SaveResult } from '../persistence/ports';
import { persistConversationTurnById } from './conversation-persistence';

const incomingMessages = [{ id: 'u1', role: 'user', parts: [] }] as UIMessage[];
const finalMessages = [
  { id: 'u1', role: 'user', parts: [] },
  { id: 'a1', role: 'assistant', parts: [] },
] as UIMessage[];

const userTurn = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as UIMessage;
function assistantTurn(text: string, metadata?: unknown): UIMessage {
  const parts = text ? [{ type: 'text', text }] : [];
  return { id: 'a1', role: 'assistant', parts, ...(metadata ? { metadata } : {}) } as UIMessage;
}

/** A multi-conversation store recording every `saveTurn`, with a scripted `SaveResult`. */
function fakeMultiStore(result: SaveResult): MultiConversationStore & {
  calls: { id: string; messages: UIMessage[]; baseRevision: number | undefined }[];
} {
  const calls: { id: string; messages: UIMessage[]; baseRevision: number | undefined }[] = [];
  return {
    calls,
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    rename: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => true),
    branch: vi.fn(async (): Promise<BranchResult> => ({ ok: false, reason: 'not-found' })),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    healMessages: vi.fn(async () => undefined),
    saveTurn: async (_owner, id, messages, baseRevision) => {
      calls.push({ id, messages, baseRevision });
      return result;
    },
  };
}

describe('persistConversationTurnById', () => {
  it('creates on first send: saveTurn for the id with no baseRevision, reports persisted', async () => {
    const store = fakeMultiStore({ ok: true, revision: 1 });
    const persisted = await persistConversationTurnById(
      store,
      'local',
      'conv-1',
      { status: 'completed', finalMessages, incomingMessages },
      undefined,
    );
    expect(persisted).toBe(true);
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0]?.id).toBe('conv-1');
    expect(store.calls[0]?.baseRevision).toBeUndefined();
    expect(store.calls[0]?.messages).toEqual(finalMessages);
  });

  it('bumps an existing conversation: passes the baseRevision through to saveTurn', async () => {
    const store = fakeMultiStore({ ok: true, revision: 4 });
    await persistConversationTurnById(
      store,
      'local',
      'conv-1',
      { status: 'completed', finalMessages, incomingMessages },
      3,
    );
    expect(store.calls[0]?.baseRevision).toBe(3);
  });

  it('applies the empty-turn rule: an abort with no content never calls saveTurn, reports not persisted', async () => {
    const store = fakeMultiStore({ ok: true, revision: 1 });
    const persisted = await persistConversationTurnById(
      store,
      'local',
      'conv-1',
      {
        status: 'aborted',
        finalMessages: [userTurn, assistantTurn('', { createdAt: 1 })],
        incomingMessages: [userTurn],
      },
      undefined,
    );
    expect(persisted).toBe(false);
    expect(store.calls).toHaveLength(0);
  });

  it('logs and does not throw when saveTurn returns a post-stream conflict', async () => {
    const store = fakeMultiStore({ ok: false, conflict: true, currentRevision: 7 });
    // Spy the same cached LogTape instance the module uses (getLogger returns a singleton per
    // category) so we can assert exactly one content-safe warning carrying `currentRevision`.
    const warnSpy = vi.spyOn(serverLogger('chat'), 'warning');
    // A save-time conflict still means the row exists (a concurrent writer holds it), so the turn
    // reports persisted=true: the active pointer may safely point at it.
    await expect(
      persistConversationTurnById(
        store,
        'local',
        'conv-1',
        { status: 'completed', finalMessages, incomingMessages },
        3,
      ),
    ).resolves.toBe(true);
    expect(store.calls).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const calls = warnSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
    const meta = calls[0]?.[1] ?? {};
    // Content-safe: the warning carries the conflict revision; its metadata keys are only the
    // ids/revisions allow-list, never a message-text or title field.
    expect(meta).toMatchObject({ currentRevision: 7 });
    expect(Object.keys(meta).toSorted()).toEqual(
      ['baseRevision', 'currentRevision', 'id', 'owner'].toSorted(),
    );
    warnSpy.mockRestore();
  });
});
