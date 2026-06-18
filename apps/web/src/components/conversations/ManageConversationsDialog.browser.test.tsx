import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

// The dialog opens no network on mount; stub the batch-delete mutation defensively so an accidental
// call cannot hit the (absent) server. This test only exercises open/close and focus restoration.
vi.mock('../../lib/conversation/conversationMutations', () => ({
  batchDeleteConversations: vi.fn(),
}));

import { ManageConversationsDialog } from './ManageConversationsDialog';

const LIST: ConversationListResponse = {
  conversations: [
    { id: 'aaa-111', title: 'First chat', updatedAt: 2, pinnedAt: null, revision: 1 },
    { id: 'bbb-222', title: 'Second chat', updatedAt: 1, pinnedAt: null, revision: 1 },
  ],
  activeId: 'aaa-111',
};

/** Render the dialog entry point with a primed list cache. */
async function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, LIST);
  await render(
    <QueryClientProvider client={queryClient}>
      <ManageConversationsDialog />
    </QueryClientProvider>,
  );
}

test('the launch button names the count and opens a titled modal dialog with the list', async () => {
  await renderDialog();
  const launch = page.getByRole('button', { name: 'Manage conversations, 2 total' });
  await expect.element(launch).toBeInTheDocument();

  await userEvent.click(launch);
  const dialog = page.getByRole('dialog', { name: 'Manage conversations' });
  await expect.element(dialog).toBeInTheDocument();
  await expect.element(page.getByRole('checkbox', { name: 'First chat' })).toBeInTheDocument();
});

test('closing the dialog with Escape restores focus to the launch button', async () => {
  await renderDialog();
  const launch = page.getByRole('button', { name: 'Manage conversations, 2 total' });
  await userEvent.click(launch);
  await expect
    .element(page.getByRole('dialog', { name: 'Manage conversations' }))
    .toBeInTheDocument();

  await userEvent.keyboard('{Escape}');
  await expect
    .element(page.getByRole('dialog', { name: 'Manage conversations' }))
    .not.toBeInTheDocument();
  // Radix cannot restore focus for this controlled, triggerless dialog; useDialogOpenerFocus does.
  await expect.element(launch).toHaveFocus();
});
