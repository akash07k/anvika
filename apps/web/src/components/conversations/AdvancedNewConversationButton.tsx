import { useKeymap } from '../../hooks/shortcuts/useKeymap';
import { toAriaKeyShortcuts } from '../../lib/keyboard/keyboardHelpers';

/** Props for {@link AdvancedNewConversationButton}. */
export interface AdvancedNewConversationButtonProps {
  /** Called when the button is clicked to open the advanced new-conversation dialog. */
  onClick: () => void;
}

/**
 * The "New conversation with options" button: opens the advanced new-conversation dialog with an
 * optional title and model picker. The label names what the dialog offers rather than relying on a
 * trailing "..." to hint at a dialog, and it matches the `newConversationAdvanced` cheatsheet label
 * so the button and the keyboard shortcut read identically. `aria-keyshortcuts` advertises the
 * Alt+Shift+N hotkey so a screen-reader user discovers it from the button itself.
 *
 * @param props - See {@link AdvancedNewConversationButtonProps}.
 * @returns The advanced new-conversation trigger button.
 */
export function AdvancedNewConversationButton({ onClick }: AdvancedNewConversationButtonProps) {
  const keymap = useKeymap();
  return (
    <button
      type="button"
      aria-keyshortcuts={toAriaKeyShortcuts(keymap.newConversationAdvanced)}
      onClick={onClick}
    >
      New conversation with options
    </button>
  );
}
