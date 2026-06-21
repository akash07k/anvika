import { useEffect, useRef } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  conversationDetailKey,
  conversationsListKey,
} from '../../lib/conversation/conversationQueries';
import {
  conversationsBroadcaster,
  type ConversationBroadcastEvent,
} from '../../lib/conversation/conversationsBroadcast';

/** What {@link useConversationBroadcast} needs to react to cross-tab events for the current surface. */
export interface ConversationBroadcastOptions {
  /** The conversation id currently on screen, or `undefined` for a non-conversation surface. */
  viewedId: string | undefined;
  /** Whether THIS tab has a turn in flight - `submitted` OR `streaming` - so a viewed-id update never disturbs it. */
  isBusy: boolean;
  /**
   * Called when the conversation currently on screen was deleted in another tab, so the surface can flip
   * to a "deleted elsewhere" state. It must NOT announce or steal focus from here - the surface owns that.
   */
  onDeletedElsewhere: () => void;
}

/**
 * Subscribe to cross-tab conversation broadcasts and refresh the right TanStack Query caches, so a
 * change made in another tab (a finished turn, rename, delete, branch, pin, retitle) propagates here.
 *
 * Reactions, all CONTENT-SAFE and side-effect-minimal:
 * - `list-changed` invalidates the `['conversations']` list so it reorders/retitles.
 * - `conversation-updated {id}` invalidates `['conversation', id]` ONLY when it is the viewed
 *   conversation AND this tab is NOT streaming. It never steals focus, never announces, and never
 *   touches `useChat` message state - it only marks the detail query stale so its observer refetches.
 * - `conversation-deleted {id}` calls {@link ConversationBroadcastOptions.onDeletedElsewhere} when it is
 *   the viewed conversation; otherwise it invalidates the list so the deleted row disappears.
 *
 * The latest `viewedId`/`isBusy` are read through refs so the subscription is set up ONCE on mount
 * (not torn down and rebuilt every render), and removed on unmount.
 *
 * @param options - See {@link ConversationBroadcastOptions}.
 */
export function useConversationBroadcast({
  viewedId,
  isBusy,
  onDeletedElsewhere,
}: ConversationBroadcastOptions): void {
  const queryClient = useQueryClient();
  // Latest values read inside the once-mounted handler, so the subscription never re-binds per render.
  const viewedIdRef = useRef(viewedId);
  const isBusyRef = useRef(isBusy);
  const onDeletedElsewhereRef = useRef(onDeletedElsewhere);
  viewedIdRef.current = viewedId;
  isBusyRef.current = isBusy;
  onDeletedElsewhereRef.current = onDeletedElsewhere;

  useEffect(() => {
    const handle = (event: ConversationBroadcastEvent): void => {
      switch (event.type) {
        case 'list-changed':
          void queryClient.invalidateQueries({ queryKey: conversationsListKey });
          return;
        case 'conversation-updated':
          // Only refresh the viewed conversation, and never while this tab is streaming (a refetch
          // mid-stream would race the live `useChat` state). Query-only: no focus, no announce.
          if (event.id === viewedIdRef.current && !isBusyRef.current) {
            void queryClient.invalidateQueries({ queryKey: conversationDetailKey(event.id) });
          }
          return;
        case 'conversation-deleted':
          if (event.id === viewedIdRef.current) onDeletedElsewhereRef.current();
          // The deleted conversation is not on screen: refresh the list so its row disappears.
          else void queryClient.invalidateQueries({ queryKey: conversationsListKey });
          return;
      }
    };
    return conversationsBroadcaster.subscribe(handle);
  }, [queryClient]);
}
