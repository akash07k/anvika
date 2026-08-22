import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

import {
  conversationDetailKey,
  conversationsListKey,
} from '../../lib/conversation/conversationQueries';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { useChatTurnCompletion } from './useChatTurnCompletion';

const ID = 'aaa-111';

function render(conversationId = ID) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useChatTurnCompletion(conversationId), { wrapper }), queryClient };
}

it('invalidates the list and conversation detail after a turn finishes', () => {
  const { result, queryClient } = render();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

  result.current();

  expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(ID) });
});

it('broadcasts the conversation update and list change after a turn finishes', () => {
  const post = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  try {
    const { result } = render();
    result.current();

    expect(post).toHaveBeenCalledWith({ type: 'conversation-updated', id: ID });
    expect(post).toHaveBeenCalledWith({ type: 'list-changed' });
  } finally {
    post.mockRestore();
  }
});
