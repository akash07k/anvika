import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

// Stub the hooks that talk to the server so this test is network-free.
const createMock = vi.fn();
vi.mock('../../hooks/conversation/useAdvancedNewConversation', () => ({
  useAdvancedNewConversation: () => ({ create: createMock }),
}));

vi.mock('../../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: [], isPending: false }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

import { AdvancedNewConversationDialog } from './AdvancedNewConversationDialog';

/** Host that controls the dialog open-state, mirroring AppShell's ownership. */
function Harness() {
  const [open, setOpen] = useState(false);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <button type="button" onClick={() => setOpen(true)}>
        New conversation with options
      </button>
      <AdvancedNewConversationDialog open={open} onOpenChange={setOpen} />
    </QueryClientProvider>
  );
}

test('opens with focus on the dialog title', async () => {
  await render(<Harness />);
  await userEvent.click(page.getByRole('button', { name: 'New conversation with options' }));

  const dialog = page.getByRole('dialog', { name: 'New conversation' });
  await expect.element(dialog).toBeInTheDocument();
  await expect.element(page.getByRole('heading', { name: 'New conversation' })).toHaveFocus();
});

test('dialog contains a Title field and a Model combobox', async () => {
  await render(<Harness />);
  await userEvent.click(page.getByRole('button', { name: 'New conversation with options' }));

  await expect.element(page.getByRole('textbox', { name: 'Title (optional)' })).toBeInTheDocument();
  // The model picker trigger is a button labelled by the field label + current selection.
  await expect.element(page.getByText('Use default model')).toBeInTheDocument();
});

test('Cancel closes the dialog and restores focus to the opener', async () => {
  await render(<Harness />);
  const opener = page.getByRole('button', { name: 'New conversation with options' });
  await userEvent.click(opener);

  await expect.element(page.getByRole('dialog', { name: 'New conversation' })).toBeInTheDocument();

  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));

  await expect
    .element(page.getByRole('dialog', { name: 'New conversation' }))
    .not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
});

test('Escape closes the dialog and restores focus to the opener', async () => {
  await render(<Harness />);
  const opener = page.getByRole('button', { name: 'New conversation with options' });
  await userEvent.click(opener);

  await expect.element(page.getByRole('dialog', { name: 'New conversation' })).toBeInTheDocument();

  await userEvent.keyboard('{Escape}');

  await expect
    .element(page.getByRole('dialog', { name: 'New conversation' }))
    .not.toBeInTheDocument();
  await expect.element(opener).toHaveFocus();
});

test('Create button calls the create action and closes the dialog', async () => {
  await render(<Harness />);
  await userEvent.click(page.getByRole('button', { name: 'New conversation with options' }));

  await expect.element(page.getByRole('dialog', { name: 'New conversation' })).toBeInTheDocument();

  await userEvent.click(page.getByRole('button', { name: 'Create' }));

  await expect
    .element(page.getByRole('dialog', { name: 'New conversation' }))
    .not.toBeInTheDocument();
  expect(createMock).toHaveBeenCalledOnce();
  expect(createMock).toHaveBeenCalledWith({ title: '', model: null });
});
