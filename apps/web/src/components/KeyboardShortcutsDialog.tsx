import { useDialogTitleFocus } from '../hooks/focus/useDialogTitleFocus';

import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { KeyboardShortcuts } from './KeyboardShortcuts';

/** Props for {@link KeyboardShortcutsDialog}. */
export interface KeyboardShortcutsDialogProps {
  /** Whether the dialog is shown. The parent owns this state. */
  open: boolean;
  /** Invoked on any dismissal (Escape, the Close button, or an outside press). */
  onClose: () => void;
}

/**
 * The keyboard-shortcuts modal: a shadcn {@link Dialog} (Radix) wrapping the canonical
 * {@link KeyboardShortcuts} listing under a "Keyboard shortcuts" title. Opened by `Alt+/` and the
 * Settings button; opening over the chat preserves the conversation and scroll position (the reason a
 * dialog is the primary surface). The focus trap and Escape-to-dismiss come from the primitive
 * (ADR 0031); {@link useDialogTitleFocus} focuses the title on open (so screen-reader users read the
 * dialog top-to-bottom) and restores focus to the opener on close. Read-only; no rebinding.
 *
 * `aria-describedby={undefined}` opts out of Radix's missing-description warning: the title alone names
 * the dialog and a separate description would be redundant for a shortcut listing.
 *
 * @param props - See {@link KeyboardShortcutsDialogProps}.
 * @returns The shortcuts dialog.
 */
export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const { titleRef, dialogProps } = useDialogTitleFocus();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} {...dialogProps}>
        <DialogTitle ref={titleRef} tabIndex={-1}>
          Keyboard shortcuts
        </DialogTitle>
        <KeyboardShortcuts />
      </DialogContent>
    </Dialog>
  );
}
