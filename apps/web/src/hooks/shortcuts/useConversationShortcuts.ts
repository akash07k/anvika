import { useNavigate } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';

import { type KeymapAction } from '@anvika/shared/settings/keymap';
import { CONVERSATION_QUICK_NAV_ACTIONS } from '@anvika/shared/settings/keymap-quick-nav';

import { focusActiveConversationRow } from '../../lib/conversation/conversationNavFocus';
import { useConversationList } from '../../lib/conversation/conversationQueries';
import { navigateToConversationAndFocusComposer } from '../../lib/conversation/navigateToConversation';
import { notify } from '../../notifications/notifier';
import { useNewConversation } from '../conversation/useNewConversation';

/** Tags the conversation shortcuts still fire on, so they work while the composer textarea has focus. */
const FORM_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'] as const;

/** What {@link useConversationShortcuts} needs: the resolved keymap (defaults merged with overrides). */
export interface ConversationShortcutsOptions {
  /** The resolved keymap, the single source of the (rebindable) bindings. */
  keymap: Record<KeymapAction, string>;
  /**
   * Called to open the advanced new-conversation dialog. When provided, the `newConversationAdvanced`
   * (Alt+Shift+N) binding fires this instead of being a no-op. AppShell owns the open-state and
   * threads this down.
   */
  openAdvancedNew?: (() => void) | undefined;
}

/**
 * Bind the app-wide conversation shortcuts, all from the resolved keymap (rebindable):
 * `newConversation` (mint a draft + focus the composer, delegated to {@link useNewConversation}),
 * `newConversationAdvanced` (open the advanced new-conversation dialog, via `openAdvancedNew`),
 * `focusConversationList` (move focus into the list), and `conversationQuickNav1`..`0` (switch to the
 * Nth-most-recent conversation, slot 1 most recent). Each switch navigates and focuses the composer,
 * then announces the slot; an empty slot speaks a no-op notice and does NOT navigate. Every spoken
 * cue carries ONLY the content-safe slot number - never a conversation id, title, or message text.
 *
 * Bound in the default `*` scope (no `scopes`) with `enableOnFormTags`, so they fire on every route
 * and while the composer has focus - matching the always-on global shortcuts. This is the same option
 * shape AppShell's removed inline `newConversation` binding used.
 *
 * @param options - See {@link ConversationShortcutsOptions}.
 */
export function useConversationShortcuts({
  keymap,
  openAdvancedNew,
}: ConversationShortcutsOptions): void {
  const navigate = useNavigate();
  const { createConversation } = useNewConversation();
  const { data } = useConversationList();
  const opts = { preventDefault: true, enableOnFormTags: FORM_TAGS };

  useHotkeys(keymap.newConversation, () => createConversation(), opts, [
    keymap.newConversation,
    createConversation,
  ]);
  useHotkeys(keymap.newConversationAdvanced, () => openAdvancedNew?.(), opts, [
    keymap.newConversationAdvanced,
    openAdvancedNew,
  ]);
  useHotkeys(keymap.focusConversationList, () => focusActiveConversationRow(), opts, [
    keymap.focusConversationList,
  ]);

  // Quick-switch: one binding per slot - a constant ten iterations (mirrors useChatHotkeys). Slot N is
  // the Nth-most-recent conversation (the list is `updatedAt` DESC), so it is `conversations[N-1]`.
  // This "most recent" order follows the server's `updatedAt`-DESC list order, which may differ from
  // the visually pinned-first nav order when pins exist - intended, since the cue says "most recent",
  // not "top of the list".
  CONVERSATION_QUICK_NAV_ACTIONS.forEach((action, index) => {
    const slot = index + 1;
    useHotkeys(
      keymap[action],
      () => {
        const target = data?.conversations[slot - 1];
        if (!target) {
          notify({ type: 'conversationQuickNavEmpty' });
          return;
        }
        navigateToConversationAndFocusComposer(navigate, target.id);
        notify({ type: 'conversationSwitched', slot });
      },
      opts,
      [keymap[action], data, navigate],
    );
  });
}
