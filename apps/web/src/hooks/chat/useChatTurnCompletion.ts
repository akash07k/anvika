import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { invalidateConversation } from '../../lib/conversation/conversationQueries';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';

/**
 * Build the post-turn cache refresh and cross-tab notification callback for one conversation.
 *
 * @param conversationId - The persisted conversation that may need its detail and list refreshed.
 * @returns A stable callback for `useChat` completion handling.
 */
export function useChatTurnCompletion(conversationId: string | undefined): () => void {
  const queryClient = useQueryClient();

  return useCallback(() => {
    invalidateConversation(queryClient, conversationId);
    // Tell the other tabs THIS turn landed so their list reorders and the viewed detail refreshes.
    // Content-safe (ids only) and best-effort - `post` never throws.
    if (conversationId) {
      conversationsBroadcaster.post({ type: 'conversation-updated', id: conversationId });
    }
    conversationsBroadcaster.post({ type: 'list-changed' });
  }, [queryClient, conversationId]);
}
