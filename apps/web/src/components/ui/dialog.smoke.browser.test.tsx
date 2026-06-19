import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './dialog';

// Smoke test for the vendored shadcn Dialog (Radix). Real Chromium exercises the open, the focus
// trap, Escape-to-close, and focus-return that jsdom cannot model (ADR 0013). Accessible queries only.

function Harness() {
  return (
    <Dialog>
      <DialogTrigger>Open dialog</DialogTrigger>
      <DialogContent>
        <DialogTitle>Dialog title</DialogTitle>
        <DialogDescription>Dialog body text.</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

test('opens from the keyboard, exposes the dialog role, Escape closes and returns focus', async () => {
  await render(<Harness />);
  const trigger = page.getByRole('button', { name: 'Open dialog' });
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  const dialog = page.getByRole('dialog', { name: 'Dialog title' });
  await expect.element(dialog).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});
