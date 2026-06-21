import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  conversationDetailKey,
  conversationsListKey,
} from '../../lib/conversation/conversationQueries';
import type {
  ConversationBroadcastEvent,
  ConversationBroadcastHandler,
} from '../../lib/conversation/conversationsBroadcast';
import { useConversationBroadcast } from './useConversationBroadcast';

/** The handler the hook registers with `subscribe`, captured so tests can drive synthetic events. */
let captured: ConversationBroadcastHandler | undefined;
const unsubscribe = vi.fn();

vi.mock('../../lib/conversation/conversationsBroadcast', () => ({
  conversationsBroadcaster: {
    post: vi.fn(),
    subscribe: (handler: ConversationBroadcastHandler) => {
      captured = handler;
      return unsubscribe;
    },
    dispose: vi.fn(),
  },
}));

const VIEWED = 'viewed-1';
const OTHER = 'other-2';

beforeEach(() => {
  captured = undefined;
  unsubscribe.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Render the subscriber hook under a fresh QueryClient, exposing the client and a captured emitter. */
function render(over: {
  viewedId?: string | undefined;
  isBusy?: boolean;
  onDeletedElsewhere?: () => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const onDeletedElsewhere = over.onDeletedElsewhere ?? vi.fn();
  const result = renderHook(
    (props: { viewedId?: string | undefined; isBusy: boolean }) =>
      useConversationBroadcast({
        viewedId: props.viewedId,
        isBusy: props.isBusy,
        onDeletedElsewhere,
      }),
    {
      wrapper,
      initialProps: { viewedId: over.viewedId ?? VIEWED, isBusy: over.isBusy ?? false },
    },
  );
  const emit = (event: ConversationBroadcastEvent) => captured?.(event);
  return { queryClient, emit, onDeletedElsewhere, ...result };
}

describe('useConversationBroadcast', () => {
  it('list-changed invalidates the conversation list', () => {
    const { queryClient, emit } = render({});
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'list-changed' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('conversation-updated for the viewed id while idle invalidates only the detail key', () => {
    const { queryClient, emit } = render({ viewedId: VIEWED, isBusy: false });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'conversation-updated', id: VIEWED });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(VIEWED) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('conversation-updated for the viewed id WHILE STREAMING does nothing', () => {
    const { queryClient, emit } = render({ viewedId: VIEWED, isBusy: true });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'conversation-updated', id: VIEWED });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('conversation-updated for a DIFFERENT id does not invalidate the detail', () => {
    const { queryClient, emit } = render({ viewedId: VIEWED, isBusy: false });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'conversation-updated', id: OTHER });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: conversationDetailKey(OTHER) });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: conversationDetailKey(VIEWED) });
  });

  it('conversation-deleted for the viewed id calls onDeletedElsewhere (and does not invalidate)', () => {
    const onDeletedElsewhere = vi.fn();
    const { queryClient, emit } = render({ viewedId: VIEWED, onDeletedElsewhere });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'conversation-deleted', id: VIEWED });
    expect(onDeletedElsewhere).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('conversation-deleted for a DIFFERENT id invalidates the list, not the surface', () => {
    const onDeletedElsewhere = vi.fn();
    const { queryClient, emit } = render({ viewedId: VIEWED, onDeletedElsewhere });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    emit({ type: 'conversation-deleted', id: OTHER });
    expect(onDeletedElsewhere).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('reads the latest viewedId/isBusy via refs without re-subscribing on re-render', () => {
    const { queryClient, emit, rerender } = render({ viewedId: VIEWED, isBusy: true });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    // Re-render with streaming now false: the same captured handler must observe the fresh value.
    rerender({ viewedId: VIEWED, isBusy: false });
    emit({ type: 'conversation-updated', id: VIEWED });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(VIEWED) });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render({});
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
