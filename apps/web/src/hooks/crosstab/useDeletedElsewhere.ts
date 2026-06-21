import { useState } from 'react';

import { useConversationBroadcast } from './useConversationBroadcast';

/**
 * Track whether the conversation on screen was deleted in ANOTHER tab. Mounts the cross-tab broadcast
 * subscriber ({@link useConversationBroadcast}) for the viewed conversation, refreshing query caches on
 * remote changes and flipping its returned flag when this conversation is deleted elsewhere. The flag
 * is one-way (it never resets here): the surface that reads it routes the user away to a fresh state.
 *
 * @param viewedId - The conversation id currently on screen, or `undefined` for a non-conversation surface.
 * @param isBusy - Whether this tab has a turn in flight (`submitted` or `streaming`), so a viewed-id update never disturbs it.
 * @returns `true` once this conversation has been deleted in another tab.
 */
export function useDeletedElsewhere(viewedId: string | undefined, isBusy: boolean): boolean {
  const [deletedElsewhere, setDeletedElsewhere] = useState(false);
  useConversationBroadcast({
    viewedId,
    isBusy,
    onDeletedElsewhere: () => setDeletedElsewhere(true),
  });
  return deletedElsewhere;
}
