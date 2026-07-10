import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigateMock }));
vi.mock('../../lib/message/messageFocus', () => ({ forceFocus: vi.fn() }));

import * as mutations from '../../lib/conversation/conversationMutations';
import { useMessageActions } from './useMessageActions';

const ID = 'aaa-111';

const regenerateMessageMock = vi.fn();
const editMessageMock = vi.fn();

/** Render the hook under a fresh retry-off QueryClient with the injected chat-action dependencies. */
function render(conversationId: string | undefined, baseRevision: number | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(
    () =>
      useMessageActions(conversationId, baseRevision, {
        regenerateMessage: regenerateMessageMock,
        editMessage: editMessageMock,
      }),
    { wrapper },
  );
}

let branchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  branchSpy = vi.spyOn(mutations, 'branchConversation').mockResolvedValue({
    id: 'new',
    title: 't',
    revision: 0,
    updatedAt: 1,
    pinnedAt: null,
  } as never);
  vi.spyOn(mutations, 'setActiveConversation').mockResolvedValue(undefined);
  navigateMock.mockClear();
  regenerateMessageMock.mockClear();
  editMessageMock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('branchFromHere is undefined when the conversation is not persisted (baseRevision undefined)', () => {
  const { result } = render(ID, undefined);
  expect(result.current.branchFromHere).toBeUndefined();
});

it('branchFromHere is undefined when there is no conversation id', () => {
  const { result } = render(undefined, 0);
  expect(result.current.branchFromHere).toBeUndefined();
});

it('branchFromHere branches the conversation through the given index when persisted', async () => {
  const { result } = render(ID, 3);
  expect(typeof result.current.branchFromHere).toBe('function');
  result.current.branchFromHere?.(2);
  // The callback dispatches the branch fire-and-forget (returns void), so await the microtask queue.
  await vi.waitFor(() => expect(branchSpy).toHaveBeenCalledTimes(1));
  const [sourceArg, , , throughIndexArg] = branchSpy.mock.calls[0] as [
    string,
    string,
    number,
    number | undefined,
  ];
  expect(sourceArg).toBe(ID);
  expect(throughIndexArg).toBe(2);
});

it('regenerate delegates to the injected regenerateMessage with the given message id', () => {
  // Regenerate is always available (not persisted-gated like branch); the menu role-filters to
  // assistant rows. A draft surface (no id, no revision) still exposes the regenerate callback.
  const { result } = render(undefined, undefined);
  expect(typeof result.current.regenerate).toBe('function');
  result.current.regenerate?.('m-7');
  expect(regenerateMessageMock).toHaveBeenCalledTimes(1);
  expect(regenerateMessageMock).toHaveBeenCalledWith('m-7');
});

it('edit delegates to the injected editMessage with the given message id and text', () => {
  // Edit is always available (gating/role-filtering happens in the menu/UI). A draft surface (no id,
  // no revision) still exposes the edit callback.
  const { result } = render(undefined, undefined);
  expect(typeof result.current.edit).toBe('function');
  result.current.edit?.('m-3', 'new text');
  expect(editMessageMock).toHaveBeenCalledTimes(1);
  expect(editMessageMock).toHaveBeenCalledWith('m-3', 'new text');
});
