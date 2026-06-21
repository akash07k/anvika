import { useRef } from 'react';

/** Radix `on*AutoFocus` handlers to spread onto a `DialogContent`/`AlertDialogContent`. */
export interface DialogOpenerFocusHandlers {
  /** Captures the opener before Radix moves focus into the dialog. */
  onOpenAutoFocus: (event: Event) => void;
  /** Restores focus to the captured opener instead of Radix's (null) trigger. */
  onCloseAutoFocus: (event: Event) => void;
}

/**
 * Restore focus to the element that opened a controlled, triggerless Radix dialog.
 *
 * Radix only restores focus to a `DialogTrigger`/`AlertDialogTrigger` rendered inside the dialog. Our
 * dialogs are controlled by an `open` prop and opened from elsewhere (the `Alt+/` shortcut, a Settings
 * button), so on close Radix focuses its null trigger and drops focus to `<body>` - a focus-loss
 * regression for screen-reader users (ADR 0031). This hook captures the active element in Radix's
 * `onOpenAutoFocus` (which fires before focus moves into the content, so the opener is still focused)
 * and, in `onCloseAutoFocus`, refocuses that opener. It does NOT touch the open-time focus, so Radix's
 * default focus-into-dialog behavior is preserved.
 *
 * `onCloseAutoFocus` always prevents Radix's default (which would target a null trigger) and then
 * restores the opener in a microtask, but ONLY if the closing flow has not already claimed focus
 * elsewhere. That guard lets an app that manages its own close focus win - e.g. a fieldset that, after
 * deleting the row whose button opened the dialog, moves focus to a sibling - while a plain dismiss
 * (Escape/Cancel with no app focus move) still returns focus to the opener instead of dropping to
 * `<body>`.
 *
 * @returns Handlers to spread onto the dialog content element.
 */
export function useDialogOpenerFocus(): DialogOpenerFocusHandlers {
  const openerRef = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
    },
    onCloseAutoFocus: (event) => {
      const opener = openerRef.current;
      openerRef.current = null;
      // Stop Radix from restoring focus to its (null) trigger; steer focus ourselves.
      event.preventDefault();
      if (!opener?.isConnected) return;
      // Defer, then restore only if focus is still loose, so an app that moves focus on close wins.
      queueMicrotask(() => {
        const active = document.activeElement;
        if (opener.isConnected && (active === null || active === document.body)) opener.focus();
      });
    },
  };
}
