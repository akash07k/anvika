import { useHotkeys } from 'react-hotkeys-hook';

import { logDiag } from '../../diagnostics/logDiag';

/** Tags the global shortcut still fires on, so the shortcuts dialog is reachable while the
 *  composer has focus. Mirrors the array form used by {@link useChatHotkeys}. */
const FORM_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'] as const;

/** What {@link useGlobalShortcuts} needs: the open-shortcuts binding and the open handler. */
export interface GlobalShortcutsOptions {
  /** The resolved `openKeyboardShortcuts` binding from the keymap (e.g. `'alt+slash'`). */
  binding: string;
  /** Open the keyboard-shortcuts dialog. */
  onOpen: () => void;
}

/**
 * Bind the always-on `openKeyboardShortcuts` hotkey: opens the shortcuts dialog and
 * fires even while focus is inside a text input (`enableOnFormTags`), since help must always be
 * reachable. Bound in the default `*` scope (no `scopes` option), so it is active on every route
 * (chat, settings, shortcuts). Opening the dialog preserves chat context rather than navigating.
 * Emits a content-safe `keyboardShortcutsOpened` diagnostic at `info` on each open.
 *
 * @param options - The resolved binding string and the open handler.
 */
export function useGlobalShortcuts({ binding, onOpen }: GlobalShortcutsOptions): void {
  useHotkeys(
    binding,
    () => {
      logDiag({ type: 'keyboardShortcutsOpened' });
      onOpen();
    },
    { preventDefault: true, enableOnFormTags: FORM_TAGS },
    [binding, onOpen],
  );
}
