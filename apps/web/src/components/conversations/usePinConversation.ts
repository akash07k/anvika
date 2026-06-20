import { useQueryClient } from '@tanstack/react-query';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import {
  conversationsListKey,
  invalidateConversation,
  patchConversationRow,
} from '../../lib/conversation/conversationQueries';
import { setPinnedConversation } from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { notify } from '../../notifications/notifier';

/** The pin/unpin action for a single conversation row. */
export interface PinConversationAction {
  /**
   * Pin or unpin the conversation. Optimistically rewrites the row's `pinnedAt` in the cached list so
   * the nav re-sections immediately, calls the PUT, announces `conversationPinned`/`conversationUnpinned`
   * on success, and rolls the optimistic value back (then invalidates to reconcile) and announces
   * `conversationPinFailed` if the request fails. Never rejects - the failure is surfaced to the user,
   * not thrown - so the fire-and-forget caller raises no unhandled rejection. Resolves `true` when the
   * toggle persisted and `false` when it failed and was rolled back, so the caller can correct focus
   * (a failed unpin leaves the row where it was).
   *
   * @param pinned - `true` to pin, `false` to unpin.
   * @returns `true` on success, `false` on a failed-and-rolled-back toggle.
   */
  setPinned: (pinned: boolean) => Promise<boolean>;
}

/**
 * Provide the pin/unpin action for one conversation, with an optimistic list-cache update and
 * rollback. No id or title EVER crosses the notification layer - the `conversationPinned`,
 * `conversationUnpinned`, and `conversationPinFailed` events are payload-less - so pinning stays
 * content-safe in the diagnostic log while the UI still shows and speaks the affected conversation.
 *
 * The optimistic `pinnedAt` is CLOCK-FREE: when pinning, it is one greater than the largest existing
 * `pinnedAt` across the list (or `1` when nothing is pinned yet), which is enough to sort the row
 * above every current pin without reading the clock; when unpinning it is `null`. This is only a
 * provisional ordering for the instant before the server answers - the success-path
 * {@link invalidateConversation} refetch reconciles it with the server's authoritative epoch-seconds
 * `pinnedAt`. On failure ONLY this row's prior `pinnedAt` is restored (a per-row rollback via
 * {@link patchConversationRow}, not a whole-snapshot restore, so a concurrent change a sibling row
 * received while the request was in flight is never clobbered), the list is invalidated so it
 * reconciles with the server, and `conversationPinFailed` is announced; the error is NOT re-thrown,
 * because the caller dispatches `setPinned` fire-and-forget and swallowing-after-announcing avoids an
 * unhandled rejection. A `void` PUT (204) means there is nothing more to merge on success.
 *
 * @param id - The conversation id to pin or unpin.
 * @returns The {@link PinConversationAction}.
 */
export function usePinConversation(id: string): PinConversationAction {
  const queryClient = useQueryClient();

  const setPinned = async (pinned: boolean): Promise<boolean> => {
    const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
    const previousPinnedAt = list?.conversations.find((c) => c.id === id)?.pinnedAt ?? null;
    const nextPinnedAt = pinned
      ? Math.max(0, ...(list?.conversations.map((c) => c.pinnedAt ?? 0) ?? [])) + 1
      : null;
    patchConversationRow(queryClient, id, { pinnedAt: nextPinnedAt });
    try {
      await setPinnedConversation(id, pinned);
      // Pinning re-sections the list: tell the other tabs to refresh their list. Content-safe.
      conversationsBroadcaster.post({ type: 'list-changed' });
      notify({ type: pinned ? 'conversationPinned' : 'conversationUnpinned' });
      invalidateConversation(queryClient, id);
      return true;
    } catch {
      // Roll back ONLY this row's pinnedAt (not the whole snapshot, which would clobber a concurrent
      // sibling change), reconcile with the server's truth, and tell the user the change failed
      // (content-safe: no id, title, or server error crosses the notification layer).
      patchConversationRow(queryClient, id, { pinnedAt: previousPinnedAt });
      invalidateConversation(queryClient, id);
      notify({ type: 'conversationPinFailed' });
      return false;
    }
  };

  return { setPinned };
}
