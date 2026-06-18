import { useQueryClient } from '@tanstack/react-query';

import { batchDeleteConversations } from '../../lib/conversation/conversationMutations';
import { invalidateConversation } from '../../lib/conversation/conversationQueries';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { notify } from '../../notifications/notifier';

/** The batch-delete action for the Settings "Manage conversations" section. */
export interface BatchDeleteConversationsAction {
  /**
   * Delete the given conversations in one call, invalidate the list, and announce
   * `conversationsBatchDeleted` with the deleted COUNT (a content-safe number - never ids or titles).
   * No navigation is needed: the caller is on `/settings`, and the server recomputes the active id,
   * which the refreshed list query reflects. On failure nothing is removed, `conversationsBatchDeleteFailed`
   * is announced, and `false` is returned so the caller keeps the selection for a retry. Never rejects.
   *
   * @param ids - The conversation ids to delete.
   * @returns `true` when the batch deleted, `false` when it failed.
   */
  removeMany: (ids: string[]) => Promise<boolean>;
}

/**
 * Provide the batch-delete action for the Settings surface. Neither ids nor titles cross the
 * notification layer - `conversationsBatchDeleted` carries only the numeric COUNT - so the delete
 * stays content-safe in the diagnostic log. The shared `BatchDeleteSchema` caps the request at
 * `MAX_BATCH_DELETE_IDS` (1000); a larger array is rejected at the boundary rather than truncated
 * here, but a single user has no realistic way to select that many.
 *
 * @returns The {@link BatchDeleteConversationsAction}.
 */
export function useBatchDeleteConversations(): BatchDeleteConversationsAction {
  const queryClient = useQueryClient();

  const removeMany = async (ids: string[]): Promise<boolean> => {
    try {
      const result = await batchDeleteConversations(ids);
      invalidateConversation(queryClient, undefined);
      // Tell the other tabs: any tab viewing one of these flips to "deleted elsewhere"; all drop the
      // rows from their lists. Each event is content-safe (id only) and `post` never throws.
      for (const id of ids) conversationsBroadcaster.post({ type: 'conversation-deleted', id });
      conversationsBroadcaster.post({ type: 'list-changed' });
      notify({ type: 'conversationsBatchDeleted', count: result.deleted });
      return true;
    } catch {
      // The batch rejected: nothing was removed. Announce a content-safe failure (no ids/titles/count)
      // and report failure so the caller keeps the selection for a retry rather than clearing it.
      notify({ type: 'conversationsBatchDeleteFailed' });
      return false;
    }
  };

  return { removeMany };
}
