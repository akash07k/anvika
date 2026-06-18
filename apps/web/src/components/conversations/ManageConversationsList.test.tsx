import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

// Mock the API mutation layer so the batch delete is observable without a server.
const batchDeleteConversations =
  vi.fn<(ids: string[]) => Promise<{ deleted: number; activeId: string | null }>>();
vi.mock('../../lib/conversation/conversationMutations', () => ({
  batchDeleteConversations: (ids: string[]) => batchDeleteConversations(ids),
}));

// Capture announcements so the content-safe batch-delete count/failure is observable.
const announce = vi.fn();
vi.mock('../../notifications/announce', () => ({
  announce: (message: string, priority: string) => announce(message, priority),
}));

import { speechChannel } from '../../notifications/channels/speech';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { ManageConversationsList } from './ManageConversationsList';

const LIST: ConversationListResponse = {
  conversations: [
    { id: 'aaa-111', title: 'First chat', updatedAt: 3, pinnedAt: null, revision: 1 },
    { id: 'bbb-222', title: 'Second chat', updatedAt: 2, pinnedAt: null, revision: 1 },
    { id: 'ccc-333', title: '', updatedAt: 1, pinnedAt: null, revision: 0 },
  ],
  activeId: 'aaa-111',
};

// A null focus anchor: these jsdom tests assert behavior, not focus landing (the dialog focus is
// covered by ManageConversationsDialog.focus.browser.test). `focus()` on a null ref is a no-op.
const NULL_ANCHOR: RefObject<HTMLElement | null> = { current: null };

/** Render the list body with a primed list cache inside a QueryClientProvider. */
function renderList(list: ConversationListResponse = LIST) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, list);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<ManageConversationsList focusAnchorRef={NULL_ANCHOR} />, { wrapper });
  return { queryClient };
}

beforeEach(() => {
  batchDeleteConversations.mockReset().mockResolvedValue({ deleted: 2, activeId: 'aaa-111' });
  announce.mockClear();
  resetChannels();
  registerChannel(speechChannel);
});

afterEach(() => {
  resetChannels();
});

describe('ManageConversationsList', () => {
  it('renders one checkbox per conversation, naming empty titles "Untitled conversation"', () => {
    renderList();
    expect(screen.getByRole('checkbox', { name: 'First chat' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Second chat' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Untitled conversation' })).toBeInTheDocument();
  });

  it('disables Delete selected until at least one conversation is checked', () => {
    renderList();
    const deleteButton = screen.getByRole('button', { name: 'Delete selected' });
    expect(deleteButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'First chat' }));
    expect(deleteButton).toBeEnabled();
  });

  it('Select all checks every box, then becomes Deselect all to clear them', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
  });

  it('confirming deletes the selected ids, announces the count, and clears the selection', async () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'First chat' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Second chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete conversations?' });
    expect(dialog).toHaveTextContent('Delete 2 conversations?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(batchDeleteConversations).toHaveBeenCalledWith(['aaa-111', 'bbb-222']),
    );
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Deleted 2 conversations', 'high'));
    // Selection clears only after the delete resolves (the `.then`), so assert it under waitFor.
    await waitFor(() => {
      for (const checkbox of screen.getAllByRole('checkbox')) {
        expect(checkbox).not.toBeChecked();
      }
    });
  });

  it('keeps the selection and announces a failure when the batch delete rejects', async () => {
    batchDeleteConversations.mockRejectedValue(new Error('network down'));
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'First chat' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Second chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete conversations?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        'Could not delete the conversations. Please try again.',
        'high',
      ),
    );
    expect(screen.getByRole('checkbox', { name: 'First chat' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Second chat' })).toBeChecked();
    expect(announce).not.toHaveBeenCalledWith('Deleted 2 conversations', 'high');
  });

  it('cancelling the confirm dialog does not delete', () => {
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: 'First chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(batchDeleteConversations).not.toHaveBeenCalled();
  });

  it('shows an empty-state message when there are no conversations', () => {
    renderList({ conversations: [], activeId: null });
    expect(screen.getByText('No conversations to manage.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();
  });
});
