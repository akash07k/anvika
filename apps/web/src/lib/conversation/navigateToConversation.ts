import type { useNavigate } from '@tanstack/react-router';

import { requestComposerFocus } from './composerFocusIntent';

/** The navigate function returned by TanStack Router's `useNavigate` (no `from` binding). */
type Navigate = ReturnType<typeof useNavigate>;

/**
 * Navigate to a conversation's route and focus the composer, the conversation's stable focus home base.
 * Shared by {@link useNewConversation} (after minting a draft) and the conversation quick-switch
 * shortcut: both navigate to `/c/$conversationId` then focus the composer on the destination surface.
 *
 * Records a one-shot focus intent ({@link requestComposerFocus}) scoped to the destination
 * conversation id, so the composer of THAT conversation focuses itself when it mounts - and a
 * stranded intent (a navigation whose destination never mounts a composer) can only ever fire for
 * its own conversation, never an unrelated composer mount.
 *
 * @param navigate - The TanStack Router navigate function (from `useNavigate()`).
 * @param id - The target conversation id to navigate to.
 */
export function navigateToConversationAndFocusComposer(navigate: Navigate, id: string): void {
  requestComposerFocus(id);
  void navigate({ to: '/c/$conversationId', params: { conversationId: id } });
}
