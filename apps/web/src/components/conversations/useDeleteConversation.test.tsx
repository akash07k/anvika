import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { useDeleteConversation } from './useDeleteConversation';

const ID = 'aaa-111';

// Viewing a DIFFERENT conversation, so the success path never navigates (keeps this test focused on
// the cross-tab broadcast contract rather than route plumbing).
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => 'bbb-222',
}));

const events: NotificationEvent[] = [];
let deleteSpy: ReturnType<typeof vi.spyOn>;
let postSpy: ReturnType<typeof vi.spyOn>;

/** Render the hook under a fresh retry-off QueryClient. */
function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useDeleteConversation(ID, { linkId: 'row-link', sectionId: 'recent' }), {
    wrapper,
  });
}

beforeEach(async () => {
  const mutations = await import('../../lib/conversation/conversationMutations');
  deleteSpy = vi.spyOn(mutations, 'deleteConversation').mockResolvedValue({ activeId: 'bbb-222' });
  postSpy = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useDeleteConversation', () => {
  it('on a successful delete: announces, and broadcasts conversation-deleted then list-changed', async () => {
    const { result } = render();

    await result.current.remove();

    expect(deleteSpy).toHaveBeenCalledWith(ID);
    await waitFor(() => expect(events).toContainEqual({ type: 'conversationDeleted' }));
    // The deleted id flips a viewing tab to "deleted elsewhere"; list-changed drops the row everywhere.
    expect(postSpy).toHaveBeenCalledWith({ type: 'conversation-deleted', id: ID });
    expect(postSpy).toHaveBeenCalledWith({ type: 'list-changed' });
  });

  it('on a failed delete: announces failure and broadcasts nothing', async () => {
    deleteSpy.mockRejectedValue(new Error('network'));
    const { result } = render();

    await result.current.remove();

    expect(events).toContainEqual({ type: 'conversationDeleteFailed' });
    expect(postSpy).not.toHaveBeenCalled();
  });
});
