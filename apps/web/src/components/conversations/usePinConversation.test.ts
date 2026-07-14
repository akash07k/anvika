import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import {
  conversationsListKey,
  patchConversationRow,
} from '../../lib/conversation/conversationQueries';
import * as mutations from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { usePinConversation } from './usePinConversation';

const ID = 'aaa-111';
const OTHER = 'bbb-222';

/** A bare conversation summary fixture for the list cache. */
function summary(
  id: string,
  pinnedAt: number | null,
): ConversationListResponse['conversations'][number] {
  return {
    id,
    title: `Title ${id}`,
    revision: 1,
    updatedAt: 1000,
    pinnedAt,
  };
}

/** Seed the list cache with the given summaries (activeId is the first). */
function seedList(
  queryClient: QueryClient,
  conversations: ConversationListResponse['conversations'],
): void {
  queryClient.setQueryData<ConversationListResponse>(conversationsListKey, {
    conversations,
    activeId: conversations[0]?.id ?? null,
  });
}

/** Read the cached list's summary for an id, or undefined. */
function rowFor(
  queryClient: QueryClient,
  id: string,
): ConversationListResponse['conversations'][number] | undefined {
  return queryClient
    .getQueryData<ConversationListResponse>(conversationsListKey)
    ?.conversations.find((c) => c.id === id);
}

const events: NotificationEvent[] = [];
let queryClient: QueryClient;
let setPinnedSpy: ReturnType<typeof vi.spyOn>;
let postSpy: ReturnType<typeof vi.spyOn>;

/** Render the hook under a fresh retry-off QueryClient. */
function render(id: string) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => usePinConversation(id), { wrapper }), client: queryClient };
}

beforeEach(() => {
  setPinnedSpy = vi.spyOn(mutations, 'setPinnedConversation').mockResolvedValue(undefined);
  postSpy = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('usePinConversation', () => {
  it('optimistically pins above existing pins, calls the mutation, announces, and invalidates', async () => {
    const { result, client } = render(ID);
    // Existing pin at 5; the target starts unpinned.
    seedList(client, [summary(OTHER, 5), summary(ID, null)]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    // Resolves true on a persisted toggle so the caller can keep its optimistic focus target.
    await expect(result.current.setPinned(true)).resolves.toBe(true);

    // Sorts above the existing max pin (5) and is clock-free (5 + 1 = 6).
    expect(rowFor(client, ID)?.pinnedAt).toBe(6);
    expect(setPinnedSpy).toHaveBeenCalledWith(ID, true);
    expect(events).toContainEqual({ type: 'conversationPinned' });
    // Pinning re-sections the list in other tabs.
    expect(postSpy).toHaveBeenCalledWith({ type: 'list-changed' });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
    });
  });

  it('falls back to 1 for the first pin when no pins exist', async () => {
    const { result, client } = render(ID);
    seedList(client, [summary(ID, null)]);

    await result.current.setPinned(true);

    expect(rowFor(client, ID)?.pinnedAt).toBe(1);
    expect(events).toContainEqual({ type: 'conversationPinned' });
  });

  it('unpins by setting pinnedAt to null and announces conversationUnpinned', async () => {
    const { result, client } = render(ID);
    seedList(client, [summary(ID, 7)]);

    await result.current.setPinned(false);

    expect(rowFor(client, ID)?.pinnedAt).toBeNull();
    expect(setPinnedSpy).toHaveBeenCalledWith(ID, false);
    expect(events).toContainEqual({ type: 'conversationUnpinned' });
  });

  it('rolls back only this row pinnedAt, invalidates, and announces pinFailed on failure, never rejecting', async () => {
    setPinnedSpy.mockRejectedValue(new Error('network'));
    const { result, client } = render(ID);
    seedList(client, [summary(ID, null)]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    // The hook never rejects (fire-and-forget) and resolves false so the caller can correct focus.
    await expect(result.current.setPinned(true)).resolves.toBe(false);

    // Per-row rollback: the target row's optimistic pinnedAt is reverted to null.
    expect(rowFor(client, ID)?.pinnedAt).toBeNull();
    expect(events).toContainEqual({ type: 'conversationPinFailed' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('rolls back a failed unpin to the prior pinnedAt, never rejecting', async () => {
    setPinnedSpy.mockRejectedValue(new Error('network'));
    const { result, client } = render(ID);
    seedList(client, [summary(ID, 7)]);

    // A failed unpin resolves false and restores the row's prior pinnedAt rather than leaving it null.
    await expect(result.current.setPinned(false)).resolves.toBe(false);

    expect(rowFor(client, ID)?.pinnedAt).toBe(7);
    expect(events).toContainEqual({ type: 'conversationPinFailed' });
  });

  it('is a safe no-op when the list is not cached (still announces and never rejects)', async () => {
    setPinnedSpy.mockRejectedValue(new Error('network'));
    const { result, client } = render(ID);
    // No seedList: the ['conversations'] cache is absent, so patchConversationRow short-circuits.

    await expect(result.current.setPinned(true)).resolves.toBe(false);

    // Nothing was written to the (still-absent) cache, and the failure is still announced.
    expect(client.getQueryData(conversationsListKey)).toBeUndefined();
    expect(events).toContainEqual({ type: 'conversationPinFailed' });
  });

  it('preserves a concurrent sibling change on rollback (per-row, not whole-snapshot)', async () => {
    // A deferred rejection we settle by hand, so a concurrent sibling change can land AFTER the
    // optimistic update but BEFORE the failure rolls back.
    let reject!: (e: unknown) => void;
    setPinnedSpy.mockReturnValue(
      new Promise<void>((_, r) => {
        reject = r;
      }),
    );
    const { result, client } = render(ID);
    seedList(client, [summary(ID, null), summary(OTHER, null)]);

    // Start the pin but do not await: the optimistic patch applies synchronously.
    const pending = result.current.setPinned(true);
    expect(rowFor(client, ID)?.pinnedAt).toBe(1);

    // A concurrent tab pins the SIBLING row while our request is still in flight.
    patchConversationRow(client, OTHER, { pinnedAt: 9 });

    // Now the request fails and the hook rolls back.
    reject(new Error('network'));
    await expect(pending).resolves.toBe(false);

    // The target row reverts, but the sibling's concurrent change SURVIVES - a whole-snapshot
    // restore would have destroyed it.
    expect(rowFor(client, ID)?.pinnedAt).toBeNull();
    expect(rowFor(client, OTHER)?.pinnedAt).toBe(9);
    expect(events).toContainEqual({ type: 'conversationPinFailed' });
  });
});
