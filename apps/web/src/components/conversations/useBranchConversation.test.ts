import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { ApiClientError } from '../../lib/api-client';
import { conversationsListKey } from '../../lib/conversation/conversationQueries';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));
vi.mock('../../lib/message/messageFocus', () => ({ forceFocus: vi.fn() }));

// Partially mock the shared id module so a test can force `mintConversationId` to throw (its
// exhaustive-attempt cap), proving the hook catches it rather than rejecting the promise. The other
// exports (e.g. `ConversationIdSchema`, used by the response schemas) are kept via `importOriginal`.
const mintMock = vi.fn(() => 'ccc-333');
vi.mock('@anvika/shared/conversation/id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@anvika/shared/conversation/id')>()),
  mintConversationId: () => mintMock(),
}));

import * as mutations from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { useBranchConversation } from './useBranchConversation';

const SOURCE = 'aaa-111';
const OTHER = 'bbb-222';

/** A bare conversation summary fixture for the list cache. */
function summary(id: string, revision: number): ConversationListResponse['conversations'][number] {
  return { id, title: `Title ${id}`, revision, updatedAt: 1000, pinnedAt: null };
}

const events: NotificationEvent[] = [];
let queryClient: QueryClient;
let branchSpy: ReturnType<typeof vi.spyOn>;
let setActiveSpy: ReturnType<typeof vi.spyOn>;
let postSpy: ReturnType<typeof vi.spyOn>;

/** Render the hook under a fresh retry-off QueryClient, seeded with the given list. */
function render(conversations: ConversationListResponse['conversations']) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<ConversationListResponse>(conversationsListKey, {
    conversations,
    activeId: conversations[0]?.id ?? null,
  });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return {
    ...renderHook(() => useBranchConversation(SOURCE), { wrapper }),
    client: queryClient,
    invalidate,
  };
}

beforeEach(() => {
  branchSpy = vi
    .spyOn(mutations, 'branchConversation')
    .mockResolvedValue(summary('ccc-333', 0) as never);
  setActiveSpy = vi.spyOn(mutations, 'setActiveConversation').mockResolvedValue(undefined);
  postSpy = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
  navigateMock.mockClear();
  mintMock.mockReset();
  mintMock.mockReturnValue('ccc-333');
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useBranchConversation', () => {
  it('mints an id, branches from the source revision, sets active, navigates, and announces', async () => {
    const { result } = render([summary(SOURCE, 4), summary(OTHER, 2)]);

    await result.current.branch();

    expect(branchSpy).toHaveBeenCalledTimes(1);
    const [sourceArg, newIdArg, baseRevisionArg, throughIndexArg] = branchSpy.mock.calls[0] as [
      string,
      string,
      number,
      number | undefined,
    ];
    expect(sourceArg).toBe(SOURCE);
    // The minted id is unique (not the source or any existing id) and the whole conversation branches.
    expect(newIdArg).not.toBe(SOURCE);
    expect(newIdArg).not.toBe(OTHER);
    expect(baseRevisionArg).toBe(4);
    expect(throughIndexArg).toBeUndefined();
    expect(setActiveSpy).toHaveBeenCalledWith(newIdArg);
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: newIdArg },
    });
    expect(events).toContainEqual({ type: 'conversationBranched' });
    // A new conversation joined the list, so other tabs refresh their list.
    expect(postSpy).toHaveBeenCalledWith({ type: 'list-changed' });
  });

  it('forwards an explicit throughIndex to the branch mutation', async () => {
    const { result } = render([summary(SOURCE, 4), summary(OTHER, 2)]);

    await result.current.branch(2);

    const [, , , throughIndexArg] = branchSpy.mock.calls[0] as [
      string,
      string,
      number,
      number | undefined,
    ];
    expect(throughIndexArg).toBe(2);
  });

  it('uses baseRevision 0 when the source is not in the list cache', async () => {
    const { result } = render([summary(OTHER, 9)]);

    await result.current.branch();

    const [, , baseRevisionArg] = branchSpy.mock.calls[0] as [string, string, number];
    expect(baseRevisionArg).toBe(0);
  });

  it('announces conversationChangedElsewhere on a 409 conflict and never rejects', async () => {
    branchSpy.mockRejectedValue(new ApiClientError('conflict', 'changed elsewhere', undefined));
    const { result } = render([summary(SOURCE, 4)]);

    await expect(result.current.branch()).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: 'conversationChangedElsewhere' });
    expect(events).not.toContainEqual({ type: 'conversationBranchFailed' });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('announces conversationBranchFailed on any other failure and never rejects', async () => {
    branchSpy.mockRejectedValue(new ApiClientError('provider-error', 'boom', undefined));
    const { result } = render([summary(SOURCE, 4)]);

    await expect(result.current.branch()).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: 'conversationBranchFailed' });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('announces conversationBranchFailed and never rejects when minting the id throws', async () => {
    // `mintConversationId` is inside the try, so its exhaustive-attempt cap throwing is caught and
    // surfaced as the generic branch failure - it must not reject the fire-and-forget promise.
    mintMock.mockImplementation(() => {
      throw new Error('mintConversationId: exhausted attempts finding a free conversation id');
    });
    const { result } = render([summary(SOURCE, 4)]);

    await expect(result.current.branch()).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: 'conversationBranchFailed' });
    expect(events).not.toContainEqual({ type: 'conversationChangedElsewhere' });
    expect(branchSpy).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('still announces conversationBranched when a follow-up after the persisted branch rejects', async () => {
    // The branch already persisted, so a transient `setActiveConversation` rejection is a best-effort
    // follow-up: it must NOT flip the outcome to failed (mis-reporting success to a screen-reader user,
    // and letting a retry mint a second duplicate branch), and it must not reject the fire-and-forget call.
    setActiveSpy.mockRejectedValue(new Error('active PUT failed'));
    const { result } = render([summary(SOURCE, 4)]);

    await expect(result.current.branch()).resolves.toBeUndefined();

    expect(events).toContainEqual({ type: 'conversationBranched' });
    expect(events).not.toContainEqual({ type: 'conversationBranchFailed' });
    expect(events).not.toContainEqual({ type: 'conversationChangedElsewhere' });
    // The success follow-ups still ran despite the rejected active-PUT.
    expect(navigateMock).toHaveBeenCalled();
  });
});
