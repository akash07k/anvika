import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

// Smoke test for the vendored shadcn AlertDialog (Radix). Real Chromium exercises the keyboard
// open, the alertdialog role, Escape-to-close, and focus-return that jsdom cannot model
// (ADR 0013). Accessible queries only.

function Harness() {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Open delete confirmation</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete item?</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

test('opens from the keyboard, exposes the alertdialog role, Escape closes and returns focus', async () => {
  await render(<Harness />);
  const trigger = page.getByRole('button', { name: 'Open delete confirmation' });
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  const dialog = page.getByRole('alertdialog', { name: 'Delete item?' });
  await expect.element(dialog).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});
