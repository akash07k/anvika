import { useDialogOpenerFocus } from '../hooks/focus/useDialogOpenerFocus';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

/** Props for {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  /** Whether the dialog is shown. The parent owns this state. */
  open: boolean;
  /** The dialog title, used as the dialog's accessible name. */
  title: string;
  /** The body text, associated as the dialog's accessible description. */
  description: string;
  /** Label for the confirm (primary) action button. */
  confirmLabel: string;
  /** Label for the cancel (secondary) action button; defaults to `Cancel`. */
  cancelLabel?: string | undefined;
  /** When true, styles the confirm action as destructive; never the sole destructive signal. */
  destructive?: boolean | undefined;
  /** Invoked when the user activates the confirm button. */
  onConfirm: () => void;
  /** Invoked when the user cancels - the cancel button or Escape. */
  onCancel: () => void;
}

/**
 * An accessible confirmation modal built on the shadcn (Radix) AlertDialog (ADR 0031): the focus trap,
 * the `alertdialog` role, the title/description wiring, and the no-outside-dismiss behavior all come
 * from the primitive, so confirming is a deliberate Cancel-or-Confirm choice. The title names the
 * dialog and the description is its accessible description (read on focus-in); the destructive nature
 * is carried by the labels and description, never by color alone (the audience is screen-reader users).
 *
 * Confirm and cancel are wired through the buttons' own `onClick` and Escape through `onEscapeKeyDown`,
 * NOT through `onOpenChange`: an AlertDialogAction click also requests a close, so routing closes to
 * `onCancel` would fire cancel on confirm. {@link useDialogOpenerFocus} restores focus to the opener,
 * which Radix cannot do for this controlled, triggerless dialog. The parent owns `open` and closes the
 * dialog by flipping it in its `onConfirm`/`onCancel` handlers.
 *
 * @param props - See {@link ConfirmDialogProps}.
 * @returns The confirmation modal.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const openerFocus = useDialogOpenerFocus();
  return (
    <AlertDialog open={open}>
      <AlertDialogContent {...openerFocus} onEscapeKeyDown={onCancel}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
