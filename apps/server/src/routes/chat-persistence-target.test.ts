import { describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type {
  ActiveConversationStore,
  BranchResult,
  IdModelOverrideStore,
  MultiConversationStore,
  SaveResult,
} from '../persistence/ports';
import { readModelOverride, resolveChatPersistenceTarget } from './chat-persistence-target';

const finalMessages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
] as UIMessage[];
const userTurn = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as UIMessage;
const emptyAssistant = { id: 'a1', role: 'assistant', parts: [] } as UIMessage;

/**
 * A store implementing both the multi-conversation and active-pointer ports, recording every
 * `setActiveId` call and scripting `saveTurn`. `setActiveId` can be made to reject to exercise the
 * best-effort path.
 */
type RecordingStore = MultiConversationStore &
  ActiveConversationStore & {
    saveCalls: { id: string }[];
    setActiveCalls: { owner: string; id: string | null }[];
  };

function fakeStore(
  saveResult: SaveResult,
  options: { setActiveRejects?: boolean } = {},
): RecordingStore {
  const saveCalls: { id: string }[] = [];
  const setActiveCalls: { owner: string; id: string | null }[] = [];
  return {
    saveCalls,
    setActiveCalls,
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    rename: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => true),
    branch: vi.fn(async (): Promise<BranchResult> => ({ ok: false, reason: 'not-found' })),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    healMessages: vi.fn(async () => undefined),
    saveTurn: async (_owner, id) => {
      saveCalls.push({ id });
      return saveResult;
    },
    getActiveId: vi.fn(async () => null),
    setActiveId: async (owner: string, id: string | null) => {
      setActiveCalls.push({ owner, id });
      if (options.setActiveRejects) throw new Error('pointer write failed');
    },
  };
}

describe('resolveChatPersistenceTarget active-pointer behavior', () => {
  it('marks the conversation active after a turn persists', async () => {
    const store = fakeStore({ ok: true, revision: 1 });
    const target = await resolveChatPersistenceTarget({
      conversationId: 'conv-1',
      baseRevision: undefined,
      multiConversationStore: store,
      activeStore: store,
    });
    await target.onTurnFinish?.({
      status: 'completed',
      finalMessages,
      incomingMessages: [userTurn],
    });
    expect(store.setActiveCalls).toEqual([{ owner: OWNER_LOCAL, id: 'conv-1' }]);
  });

  it('does NOT mark active when the empty-turn rule persists nothing', async () => {
    const store = fakeStore({ ok: true, revision: 1 });
    const target = await resolveChatPersistenceTarget({
      conversationId: 'conv-1',
      baseRevision: undefined,
      multiConversationStore: store,
      activeStore: store,
    });
    // An abort with no assistant content persists nothing, so the pointer must not move to a
    // possibly-nonexistent (draft) conversation id.
    await target.onTurnFinish?.({
      status: 'aborted',
      finalMessages: [userTurn, emptyAssistant],
      incomingMessages: [userTurn],
    });
    expect(store.saveCalls).toHaveLength(0);
    expect(store.setActiveCalls).toHaveLength(0);
  });

  it('swallows a setActiveId failure (best-effort) and logs a content-safe warning', async () => {
    const store = fakeStore({ ok: true, revision: 1 }, { setActiveRejects: true });
    const warnSpy = vi.spyOn(serverLogger('chat'), 'warning');
    const target = await resolveChatPersistenceTarget({
      conversationId: 'conv-1',
      baseRevision: undefined,
      multiConversationStore: store,
      activeStore: store,
    });
    // The turn already persisted, so a pointer-write failure must not reject the finish callback.
    await expect(
      target.onTurnFinish?.({ status: 'completed', finalMessages, incomingMessages: [userTurn] }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const calls = warnSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
    const meta = calls[0]?.[1] ?? {};
    // Content-safe: only the id and a stringified error cross the boundary, never message text.
    expect(Object.keys(meta).toSorted()).toEqual(['conversationId', 'message'].toSorted());
    expect(meta).toMatchObject({ conversationId: 'conv-1' });
    warnSpy.mockRestore();
  });

  it('tolerates an absent active store (no pointer write, turn still persists)', async () => {
    const store = fakeStore({ ok: true, revision: 1 });
    const target = await resolveChatPersistenceTarget({
      conversationId: 'conv-1',
      baseRevision: undefined,
      multiConversationStore: store,
      activeStore: undefined,
    });
    await expect(
      target.onTurnFinish?.({ status: 'completed', finalMessages, incomingMessages: [userTurn] }),
    ).resolves.toBeUndefined();
    expect(store.saveCalls).toHaveLength(1);
  });
});

describe('readModelOverride', () => {
  it('reads the override by (owner, conversationId) when both the id and the store are present', async () => {
    const seen: { owner: string; id: string }[] = [];
    const store: IdModelOverrideStore = {
      getModelOverride: async (owner, id) => {
        seen.push({ owner, id });
        return 'stored:model';
      },
      setModelOverride: async () => undefined,
    };
    expect(await readModelOverride({ conversationId: 'conv-1', idModelOverrideStore: store })).toBe(
      'stored:model',
    );
    expect(seen).toEqual([{ owner: OWNER_LOCAL, id: 'conv-1' }]);
  });

  it('returns null when the conversationId is absent (ephemeral turn)', async () => {
    const store: IdModelOverrideStore = {
      getModelOverride: async () => 'stored:model',
      setModelOverride: async () => undefined,
    };
    expect(
      await readModelOverride({ conversationId: undefined, idModelOverrideStore: store }),
    ).toBeNull();
  });

  it('returns null when the store is absent', async () => {
    expect(
      await readModelOverride({ conversationId: 'conv-1', idModelOverrideStore: undefined }),
    ).toBeNull();
  });
});
