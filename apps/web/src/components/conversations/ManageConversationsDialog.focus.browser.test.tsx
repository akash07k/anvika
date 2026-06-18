import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

// The query client of the active render, so the batch-delete mock can drive the list to empty (the
// server result) and the dialog re-renders to its empty state.
let queryClient: QueryClient;

// Mock the API mutation: deleting every selected conversation empties the cached list (what the server
// would return on the next read), then resolves with the deleted count and a null active id.
const batchDeleteConversations = vi.fn<
  (ids: string[]) => Promise<{ deleted: number; activeId: null }>
>((ids) => {
  queryClient.setQueryData(conversationsListKey, { conversations: [], activeId: null });
  return Promise.resolve({ deleted: ids.length, activeId: null });
});
vi.mock('../../lib/conversation/conversationMutations', () => ({
  batchDeleteConversations: (ids: string[]) => batchDeleteConversations(ids),
}));

// Stub the list invalidation to a no-op: the mock above already sets the empty list, and a real
// invalidation would refetch over the (absent) network and flake. `useConversationList` and the cache
// key stay real, so the dialog still reads the empty list from the cache.
vi.mock('../../lib/conversation/conversationQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conversation/conversationQueries')>()),
  invalidateConversation: () => undefined,
}));

// Capture announcements so the content-safe batch-delete count is observable without speaking.
const announce = vi.fn();
vi.mock('../../notifications/announce', () => ({
  announce: (message: string, priority: string) => announce(message, priority),
}));

import { speechChannel } from '../../notifications/channels/speech';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { ManageConversationsDialog } from './ManageConversationsDialog';

const LIST: ConversationListResponse = {
  conversations: [
    { id: 'aaa-111', title: 'First chat', updatedAt: 2, pinnedAt: null, revision: 1 },
    { id: 'bbb-222', title: 'Second chat', updatedAt: 1, pinnedAt: null, revision: 1 },
  ],
  activeId: 'aaa-111',
};

/** Render the dialog entry point with a primed list cache; expose the query client to the delete mock. */
async function renderDialog() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, LIST);
  await render(
    <QueryClientProvider client={queryClient}>
      <ManageConversationsDialog />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  batchDeleteConversations.mockClear();
  announce.mockClear();
  resetChannels();
  registerChannel(speechChannel);
});

afterEach(() => {
  resetChannels();
});

test('focuses the dialog title on open', async () => {
  await renderDialog();
  await userEvent.click(page.getByRole('button', { name: 'Manage conversations, 2 total' }));
  await expect.element(page.getByRole('heading', { name: 'Manage conversations' })).toHaveFocus();
});

test('deleting every conversation in the dialog moves focus to the dialog title, not <body>', async () => {
  await renderDialog();

  // Open the dialog from the count-bearing launch button.
  await userEvent.click(page.getByRole('button', { name: 'Manage conversations, 2 total' }));
  await expect
    .element(page.getByRole('dialog', { name: 'Manage conversations' }))
    .toBeInTheDocument();

  // Select all, then open and confirm the destructive dialog.
  await userEvent.click(page.getByRole('button', { name: 'Select all' }));
  await userEvent.click(page.getByRole('button', { name: 'Delete selected' }));
  await userEvent.click(page.getByRole('button', { name: 'Delete' }));

  await vi.waitFor(() =>
    expect(batchDeleteConversations).toHaveBeenCalledWith(['aaa-111', 'bbb-222']),
  );

  // The list is now empty, so the "Delete selected" control has unmounted; focus must land on the
  // always-present dialog title rather than falling to <body>.
  await expect.element(page.getByText('No conversations to manage.')).toBeInTheDocument();
  await expect.element(page.getByRole('heading', { name: 'Manage conversations' })).toHaveFocus();
});
