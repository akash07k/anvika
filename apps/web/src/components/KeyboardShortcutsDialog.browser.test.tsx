import { useState } from 'react';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

// Real Chromium exercises the Radix focus trap, Escape dismissal, and focus restoration to the opener
// that jsdom cannot model (ADR 0013, ADR 0031). The jsdom unit test covers rendering, the accessible
// name, and the dismissal handlers.

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open shortcuts
      </button>
      <KeyboardShortcutsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

test('opens with focus inside, Escape closes and returns focus to the opener', async () => {
  await render(<Harness />);
  const opener = page.getByRole('button', { name: 'Open shortcuts' });
  await userEvent.click(opener);

  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect.element(dialog).toBeInTheDocument();
  // The title-focus standard (useDialogTitleFocus) moves focus to the dialog title on open so
  // screen-reader users read the dialog top-to-bottom (ADR 0031).
  await expect.element(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toHaveFocus();

  await userEvent.keyboard('{Escape}');
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
});
