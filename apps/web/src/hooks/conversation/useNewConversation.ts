import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';

import { useConversationList } from '../../lib/conversation/conversationQueries';
import { navigateToConversationAndFocusComposer } from '../../lib/conversation/navigateToConversation';
import { notify } from '../../notifications/notifier';
import { useDraftStore } from '../../stores/draftStore';

/** The single conversation-create action: mint a draft, navigate to it, focus the composer. */
export interface NewConversation {
  /**
   * Create a fresh conversation draft and move to it: mint a unique id (avoiding every existing
   * conversation id), navigate to `/c/$conversationId`, focus the composer, and announce the
   * creation. Bound to the New conversation button and the `newConversation` (Alt+N) hotkey.
   */
  createConversation: () => void;
}

/**
 * Provide {@link NewConversation.createConversation}, the one action behind both the New conversation
 * button and the `newConversation` (Alt+N) hotkey. It collects the live conversation ids into a set
 * so the minted draft id is guaranteed unique, replaces the single draft via the draft store,
 * navigates to the new conversation's route, focuses the composer (the conversation's stable focus
 * home base), and fires the content-safe `conversationCreated` notification.
 *
 * The navigate-and-focus step is shared with the conversation quick-switch shortcut via
 * {@link navigateToConversationAndFocusComposer}: the composer textarea carries `id="composer"`, so a
 * deferred forced focus on it re-uses the same focus helper the message navigation uses, without
 * AppShell needing a ref into the conversation surface.
 *
 * @returns The {@link NewConversation} action object.
 */
export function useNewConversation(): NewConversation {
  const navigate = useNavigate();
  const { data } = useConversationList();

  const createConversation = useCallback(() => {
    const takenIds = new Set((data?.conversations ?? []).map((summary) => summary.id));
    // `newDraft` is a stable store action invoked imperatively at click/hotkey time, so read it off
    // `getState()` (the repo's pattern for store actions) rather than subscribing to it.
    const id = useDraftStore.getState().newDraft(takenIds);
    navigateToConversationAndFocusComposer(navigate, id);
    notify({ type: 'conversationCreated' });
  }, [data, navigate]);

  return { createConversation };
}
