import { useState } from 'react';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

// Real Chromium exercises the Radix focus placement, Escape dismissal, and focus restoration to the
// opener that jsdom cannot model (ADR 0013, ADR 0031). The jsdom unit test covers rendering, the
// accessible name/description, and the confirm/cancel handlers.

const baseProps = {
  title: 'Remove connection?',
  description: 'Remove Venice? This deletes its saved key.',
  confirmLabel: 'Remove',
};

test('focuses Cancel by default for a destructive confirm, so Enter cannot immediately confirm', async () => {
  await render(
    <ConfirmDialog {...baseProps} open destructive onConfirm={() => {}} onCancel={() => {}} />,
  );
  await expect.element(page.getByRole('button', { name: 'Cancel' })).toHaveFocus();
});

test('Escape cancels and returns focus to the opener', async () => {
  const onCancel = vi.fn();

  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Remove connection
        </button>
        <ConfirmDialog
          {...baseProps}
          destructive
          open={open}
          onConfirm={() => setOpen(false)}
          onCancel={() => {
            onCancel();
            setOpen(false);
          }}
        />
      </>
    );
  }

  await render(<Harness />);
  const opener = page.getByRole('button', { name: 'Remove connection' });
  await userEvent.click(opener);

  const dialog = page.getByRole('alertdialog', { name: 'Remove connection?' });
  await expect.element(dialog).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  expect(onCancel).toHaveBeenCalled();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
});
