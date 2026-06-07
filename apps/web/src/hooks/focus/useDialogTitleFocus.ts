import { useRef, type RefObject } from 'react';

import { useDialogOpenerFocus } from './useDialogOpenerFocus';

/** What {@link useDialogTitleFocus} returns: a ref for the title and the dialog content handlers. */
export interface DialogTitleFocus {
  /** Attach to the `DialogTitle` (give it `tabIndex={-1}`); it receives initial focus on open. */
  titleRef: RefObject<HTMLHeadingElement | null>;
  /** Spread onto `DialogContent`: focuses the title on open and restores the opener on close. */
  dialogProps: {
    onOpenAutoFocus: (event: Event) => void;
    onCloseAutoFocus: (event: Event) => void;
  };
}

/**
 * The app-wide initial-focus standard for informational and form dialogs: on open, focus moves to
 * the dialog's TITLE so a screen-reader user reads it top-to-bottom (instead of landing on a footer
 * button such as Cancel). It composes {@link useDialogOpenerFocus} for the close-time opener
 * restore, and in `onOpenAutoFocus` it first lets that hook capture the opener, then prevents
 * Radix's default (first-focusable) focus and focuses the title. Destructive `AlertDialog`s
 * deliberately do NOT use this - they keep focusing the safe Cancel action (WAI-ARIA alertdialog
 * pattern).
 *
 * @returns The title ref and the dialog content focus handlers.
 */
export function useDialogTitleFocus(): DialogTitleFocus {
  const opener = useDialogOpenerFocus();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  return {
    titleRef,
    dialogProps: {
      onOpenAutoFocus: (event) => {
        // Capture the opener before focus moves into the dialog.
        opener.onOpenAutoFocus(event);
        // Stop Radix from focusing the first focusable (e.g. a footer button).
        event.preventDefault();
        titleRef.current?.focus();
      },
      onCloseAutoFocus: opener.onCloseAutoFocus,
    },
  };
}
