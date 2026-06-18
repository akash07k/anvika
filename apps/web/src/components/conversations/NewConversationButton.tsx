import { useKeymap } from '../../hooks/shortcuts/useKeymap';
import { useNewConversation } from '../../hooks/conversation/useNewConversation';
import { toAriaKeyShortcuts } from '../../lib/keyboard/keyboardHelpers';

/**
 * The DOM id of the New conversation button: a stable focus anchor in the conversation nav. Deleting a
 * conversation removes its row (and the context-menu trigger that opened the confirm dialog), so the
 * dialog's opener-focus restoration has nowhere to land; the delete flow moves focus here instead.
 */
export const NEW_CONVERSATION_BUTTON_ID = 'new-conversation-button';

/**
 * The New conversation affordance: a button that creates a fresh conversation draft, navigates to it,
 * and focuses the composer (via {@link useNewConversation}). Its accessible name is "New conversation",
 * matching the `newConversation` (Alt+N) hotkey it duplicates so the two paths read identically. It
 * carries {@link NEW_CONVERSATION_BUTTON_ID} so the delete flow can return focus to it.
 *
 * `aria-keyshortcuts` advertises the same `newConversation` hotkey so a screen reader announces "Alt+N"
 * on the button, keeping the keyboard shortcut discoverable from the control itself. The value is read
 * from the live keymap (via {@link useKeymap}) and converted to the ARIA token form, so it stays correct
 * if the binding is ever rebound.
 */
export function NewConversationButton() {
  const { createConversation } = useNewConversation();
  const keymap = useKeymap();
  return (
    <button
      type="button"
      id={NEW_CONVERSATION_BUTTON_ID}
      aria-keyshortcuts={toAriaKeyShortcuts(keymap.newConversation)}
      onClick={createConversation}
    >
      New conversation
    </button>
  );
}
