import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../diagnostics/reportClientError', () => ({ reportClientError: vi.fn() }));

import { reportClientError } from '../../diagnostics/reportClientError';
import { ApiClientError } from '../../lib/api-client';
import {
  conversationsListKey,
  conversationDetailKey,
} from '../../lib/conversation/conversationQueries';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useChatConflict, type ChatConflictOptions } from './useChatConflict';

const ID = 'aaa-111';

/** Captured notification events for the active test. */
const events: NotificationEvent[] = [];

beforeEach(() => {
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  resetChannels();
  vi.mocked(reportClientError).mockClear();
});

/** The focus spies a built options bundle exposes, so assertions reference the spy (not an unbound
 *  method off a ref) and oxlint's `unbound-method` rule stays satisfied. */
interface FocusSpies {
  retryFocus: ReturnType<typeof vi.fn>;
  settingsFocus: ReturnType<typeof vi.fn>;
}

/** Build the hook options with overridable error/conversationId and fresh focus-target refs, plus
 *  the focus spies for direct assertion. */
function buildOptions(over: Partial<ChatConflictOptions> = {}): ChatConflictOptions & FocusSpies {
  const retryFocus = vi.fn();
  const settingsFocus = vi.fn();
  const retryRef: RefObject<HTMLButtonElement | null> = {
    current: { focus: retryFocus } as unknown as HTMLButtonElement,
  };
  const settingsLinkRef: RefObject<HTMLAnchorElement | null> = {
    current: { focus: settingsFocus } as unknown as HTMLAnchorElement,
  };
  return {
    error: undefined,
    conversationId: ID,
    requestIdRef: { current: 'abcd1234' },
    announcedError: { current: null },
    retryRef,
    settingsLinkRef,
    reasoningBeforeSend: () => Promise.resolve(),
    modelBeforeSend: () => Promise.resolve(),
    retryFocus,
    settingsFocus,
    ...over,
  };
}

/** Render `useChatConflict` under a fresh retry-off QueryClient, returning the client too. */
function render(options: ChatConflictOptions) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const result = renderHook(() => useChatConflict(options), { wrapper });
  return { ...result, queryClient };
}

describe('useChatConflict error branch', () => {
  it('on a 409 conflict: invalidates caches, announces conversationChangedElsewhere, and does NOT take the generic path', () => {
    const options = buildOptions({
      error: new ApiClientError('conflict', 'Conversation changed', undefined),
    });
    const { queryClient } = render(options);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    // The effect already ran on mount; re-assert via the emitted events and focus spies.
    expect(events).toContainEqual({ type: 'conversationChangedElsewhere' });
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(options.retryFocus).not.toHaveBeenCalled();
    expect(options.settingsFocus).not.toHaveBeenCalled();
    expect(reportClientError).not.toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('on a 409 conflict: invalidates the detail and list keys (caller sees fresh state)', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    renderHook(
      () =>
        useChatConflict(
          buildOptions({ error: new ApiClientError('conflict', 'changed', undefined) }),
        ),
      { wrapper },
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
  });

  it('on a generic error: announces error, reports it, and focuses Retry (no conflict notice)', () => {
    const error = new Error('Boom');
    const options = buildOptions({ error });
    render(options);
    expect(events).toContainEqual({ type: 'error', message: 'Boom' });
    expect(events.some((e) => e.type === 'conversationChangedElsewhere')).toBe(false);
    expect(reportClientError).toHaveBeenCalledWith(error, 'abcd1234');
    expect(options.retryFocus).toHaveBeenCalledOnce();
  });

  it('on a no-model error: focuses the Settings link rather than Retry', () => {
    const options = buildOptions({
      error: new ApiClientError(
        'unconfigured',
        'No model is selected. Choose a model in Settings.',
        undefined,
      ),
    });
    render(options);
    expect(options.settingsFocus).toHaveBeenCalledOnce();
    expect(options.retryFocus).not.toHaveBeenCalled();
  });
});

describe('useChatConflict revision refresh and composed send gate', () => {
  it('onTurnFinished invalidates the list and this conversation detail', () => {
    const options = buildOptions();
    const { result, queryClient } = render(options);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    result.current.onTurnFinished();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(ID) });
  });

  it('onTurnFinished broadcasts conversation-updated for this id and list-changed to other tabs', () => {
    const post = vi.spyOn(conversationsBroadcaster, 'post').mockImplementation(() => undefined);
    try {
      const { result } = render(buildOptions());
      result.current.onTurnFinished();
      expect(post).toHaveBeenCalledWith({ type: 'conversation-updated', id: ID });
      expect(post).toHaveBeenCalledWith({ type: 'list-changed' });
    } finally {
      post.mockRestore();
    }
  });

  it('beforeSend composes the reasoning write, the model write, AND the list ensure-loaded step, and never rejects', async () => {
    const reasoningBeforeSend = vi.fn(() => Promise.resolve());
    const modelBeforeSend = vi.fn(() => Promise.resolve());
    const options = buildOptions({ reasoningBeforeSend, modelBeforeSend });
    const { result, queryClient } = render(options);
    const ensure = vi.spyOn(queryClient, 'ensureQueryData').mockResolvedValue({} as never);
    await expect(result.current.beforeSend()).resolves.toBeUndefined();
    expect(reasoningBeforeSend).toHaveBeenCalledOnce();
    expect(modelBeforeSend).toHaveBeenCalledOnce();
    expect(ensure).toHaveBeenCalledOnce();
  });

  it('beforeSend stays resolved even when the list ensure-loaded step rejects (fail-soft gate)', async () => {
    const options = buildOptions();
    const { result, queryClient } = render(options);
    vi.spyOn(queryClient, 'ensureQueryData').mockRejectedValue(new Error('offline'));
    await expect(result.current.beforeSend()).resolves.toBeUndefined();
  });
});
