import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import * as mutations from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { useBatchDeleteConversations } from './useBatchDeleteConversations';

const IDS = ['aaa-111', 'bbb-222', 'ccc-333'];

const events: NotificationEvent[] = [];
let batchSpy: ReturnType<typeof vi.spyOn>;
let postSpy: ReturnType<typeof vi.spyOn>;

/** Render the hook under a fresh retry-off QueryClient. */
function render() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => useBatchDeleteConversations(), { wrapper });
}

beforeEach(() => {
  batchSpy = vi
    .spyOn(mutations, 'batchDeleteConversations')
    .mockResolvedValue({ deleted: IDS.length, activeId: null });
  postSpy = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useBatchDeleteConversations', () => {
  it('on a successful batch: broadcasts conversation-deleted for each id plus one list-changed', async () => {
    const { result } = render();

    await expect(result.current.removeMany(IDS)).resolves.toBe(true);

    expect(batchSpy).toHaveBeenCalledWith(IDS);
    expect(events).toContainEqual({ type: 'conversationsBatchDeleted', count: IDS.length });
    // One conversation-deleted per id (so each viewing tab flips), and exactly one list-changed.
    for (const id of IDS)
      expect(postSpy).toHaveBeenCalledWith({ type: 'conversation-deleted', id });
    const listChangedCalls = postSpy.mock.calls.filter(
      ([event]: [{ type: string }]) => event.type === 'list-changed',
    );
    expect(listChangedCalls).toHaveLength(1);
  });

  it('on a failed batch: announces failure, returns false, and broadcasts nothing', async () => {
    batchSpy.mockRejectedValue(new Error('network'));
    const { result } = render();

    await expect(result.current.removeMany(IDS)).resolves.toBe(false);

    expect(events).toContainEqual({ type: 'conversationsBatchDeleteFailed' });
    expect(postSpy).not.toHaveBeenCalled();
  });
});
