import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useTestConnection } from './useTestConnection';

/** Fresh QueryClient with retries disabled so one fetch maps to one outcome. */
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

const captured: NotificationEvent[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  resetChannels();
  captured.length = 0;
  registerChannel((event) => captured.push(event));
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetChannels();
});

/** The event types fired during a run, in order. */
function types(): NotificationEvent['type'][] {
  return captured.map((event) => event.type);
}

describe('useTestConnection owner-lifetime abort', () => {
  it('silences every outcome announcement when the owner aborts an in-flight test', async () => {
    // A hung fetch that rejects only when the request controller aborts (mirrors a real cancel).
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const owner = new AbortController();
    const { result } = renderHook(() => useTestConnection(owner.signal), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(0); // flush the start announcement
    expect(types()).toEqual(['connectionTestStarted']);

    // The owner unmounts mid-flight: abort silences the outcome but still settles the mutation.
    owner.abort();
    await vi.advanceTimersByTimeAsync(100);

    // No late OK/failed/no-listing announcement may follow the "saved" the user already heard.
    expect(types()).not.toContain('connectionTestOk');
    expect(types()).not.toContain('connectionTestOkNoListing');
    expect(types()).not.toContain('connectionTestFailed');
    // The mutation still resolves to a content-safe outcome (no value or content leaked).
    expect(result.current.data).toEqual({ kind: 'failed', category: 'error' });
  });
});
