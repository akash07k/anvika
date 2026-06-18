import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
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
import { useRenameConversation } from './useRenameConversation';

const ID = 'aaa-111';
const OTHER = 'bbb-222';

/** A bare conversation summary fixture for the list cache. */
function summary(id: string, title: string): ConversationListResponse['conversations'][number] {
  return { id, title, revision: 1, updatedAt: 1000, pinnedAt: null };
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
let renameSpy: ReturnType<typeof vi.spyOn>;
let postSpy: ReturnType<typeof vi.spyOn>;

/** Render the hook under a fresh retry-off QueryClient. */
function render(id: string) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { ...renderHook(() => useRenameConversation(id), { wrapper }), client: queryClient };
}

beforeEach(() => {
  renameSpy = vi.spyOn(mutations, 'renameConversation').mockResolvedValue(undefined);
  postSpy = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useRenameConversation', () => {
  it('optimistically rewrites the row title, calls the mutation, and announces', async () => {
    const { result, client } = render(ID);
    seedList(client, [summary(ID, 'Old title')]);

    await result.current.rename('New title');

    expect(rowFor(client, ID)?.title).toBe('New title');
    expect(renameSpy).toHaveBeenCalledWith(ID, 'New title');
    expect(events).toContainEqual({ type: 'conversationRenamed' });
    // Broadcasts both: `conversation-updated` so a tab viewing this id refreshes its detail/title,
    // and `list-changed` so other tabs' sidebars reorder/re-title.
    expect(postSpy).toHaveBeenCalledWith({ type: 'conversation-updated', id: ID });
    expect(postSpy).toHaveBeenCalledWith({ type: 'list-changed' });
  });

  it('rolls back only this row title, invalidates, and announces renameFailed on failure', async () => {
    renameSpy.mockRejectedValue(new Error('network'));
    const { result, client } = render(ID);
    seedList(client, [summary(ID, 'Old title')]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await result.current.rename('New title');

    // Per-row rollback: the target row's optimistic title is reverted to the original.
    expect(rowFor(client, ID)?.title).toBe('Old title');
    expect(events).toContainEqual({ type: 'conversationRenameFailed' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('is a safe no-op when the list is not cached (failure still announces, never rejects)', async () => {
    renameSpy.mockRejectedValue(new Error('network'));
    const { result, client } = render(ID);
    // No seedList: the cache is absent, so the optimistic patch and the previousTitle-guarded rollback
    // both short-circuit rather than writing `{ title: undefined }`.

    await result.current.rename('New title');

    expect(client.getQueryData(conversationsListKey)).toBeUndefined();
    expect(events).toContainEqual({ type: 'conversationRenameFailed' });
  });

  it('preserves a concurrent sibling change on rollback (per-row, not whole-snapshot)', async () => {
    // A deferred rejection we settle by hand, so a concurrent sibling change can land AFTER the
    // optimistic update but BEFORE the failure rolls back.
    let reject!: (e: unknown) => void;
    renameSpy.mockReturnValue(
      new Promise<void>((_, r) => {
        reject = r;
      }),
    );
    const { result, client } = render(ID);
    seedList(client, [summary(ID, 'Old title'), summary(OTHER, 'Sibling old')]);

    // Start the rename but do not await: the optimistic patch applies synchronously.
    const pending = result.current.rename('New title');
    expect(rowFor(client, ID)?.title).toBe('New title');

    // A concurrent tab renames the SIBLING row while our request is still in flight.
    patchConversationRow(client, OTHER, { title: 'Sibling renamed' });

    // Now the request fails and the hook rolls back.
    reject(new Error('network'));
    await pending;

    // The target row reverts, but the sibling's concurrent change SURVIVES - a whole-snapshot
    // restore would have destroyed it.
    expect(rowFor(client, ID)?.title).toBe('Old title');
    expect(rowFor(client, OTHER)?.title).toBe('Sibling renamed');
    expect(events).toContainEqual({ type: 'conversationRenameFailed' });
  });
});
