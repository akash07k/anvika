import { useQueryClient } from '@tanstack/react-query';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import {
  conversationsListKey,
  invalidateConversation,
  patchConversationRow,
} from '../../lib/conversation/conversationQueries';
import { renameConversation } from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { notify } from '../../notifications/notifier';

/** The inline-rename action for a single conversation row. */
export interface RenameConversationAction {
  /**
   * Persist a new title for the conversation. Optimistically rewrites the title in the cached list so
   * the row updates immediately, calls the PATCH, announces `conversationRenamed` on success, and rolls
   * the optimistic title back (then invalidates to reconcile) and announces `conversationRenameFailed`
   * if the request fails. Never rejects - the failure is surfaced to the user, not thrown - so the
   * fire-and-forget caller raises no unhandled rejection.
   *
   * @param title - The new (already trimmed, non-empty) title.
   */
  rename: (title: string) => Promise<void>;
}

/**
 * Provide the inline-rename action for one conversation, with an optimistic list-cache update and
 * rollback. The new title NEVER crosses the notification layer - the `conversationRenamed` event is
 * payload-less - so the rename stays content-safe in the diagnostic log while the title is still shown
 * and spoken in the UI.
 *
 * The optimistic update swaps only the matching row's `title` in the `['conversations']` cache and
 * captures that row's prior title; on failure it restores ONLY this row's title (a per-row rollback
 * via {@link patchConversationRow}, not a whole-snapshot restore, so a concurrent change a sibling row
 * received while the request was in flight is never clobbered), invalidates so the list reconciles
 * with the server, and announces `conversationRenameFailed` (a content-safe, payload-less failure) so
 * the screen-reader user is not left guessing why the title reverted. The error is NOT re-thrown - the
 * caller dispatches `rename` fire-and-forget, so swallowing-after-announcing avoids an unhandled
 * rejection. A `void` PATCH (204) means there is nothing more to merge on success.
 *
 * @param id - The conversation id to rename.
 * @returns The {@link RenameConversationAction}.
 */
export function useRenameConversation(id: string): RenameConversationAction {
  const queryClient = useQueryClient();

  const rename = async (title: string): Promise<void> => {
    const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
    const previousTitle = list?.conversations.find((c) => c.id === id)?.title;
    patchConversationRow(queryClient, id, { title });
    try {
      await renameConversation(id, title);
      // Tell the other tabs the rename landed. `conversation-updated` lets a tab VIEWING this
      // conversation refresh its detail query so its `document.title` follows the new title;
      // `list-changed` refreshes every other tab's sidebar list (title/order). Both content-safe (id only).
      conversationsBroadcaster.post({ type: 'conversation-updated', id });
      conversationsBroadcaster.post({ type: 'list-changed' });
      notify({ type: 'conversationRenamed' });
    } catch {
      // Roll back ONLY this row's title (not the whole snapshot, which would clobber a concurrent
      // sibling change), reconcile with the server's truth, and tell the user the rename failed
      // (content-safe: no id, title, or server error crosses the notification layer).
      if (previousTitle !== undefined)
        patchConversationRow(queryClient, id, { title: previousTitle });
      invalidateConversation(queryClient, id);
      notify({ type: 'conversationRenameFailed' });
    }
  };

  return { rename };
}
