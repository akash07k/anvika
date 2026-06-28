import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TestConnectionResponse } from '@anvika/shared/connections/contracts';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useTestConnection } from './useTestConnection';

/** Fresh QueryClient with all retries disabled, so a single fetch maps to a single outcome. */
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/** Build an ok JSON Response for the test-connection endpoint. */
function okResponse(body: TestConnectionResponse): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
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

describe('useTestConnection', () => {
  it('fires connectionTestStarted immediately on mutate', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    // TanStack schedules the mutationFn on a microtask; flush it (without reaching the 3s timer).
    await vi.advanceTimersByTimeAsync(0);

    expect(captured[0]).toEqual({ type: 'connectionTestStarted' });
  });

  it('announces still-running exactly once at 3s while still pending', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}));
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(3000);

    const stillRunning = captured.filter((e) => e.type === 'connectionTestStillRunning');
    expect(stillRunning).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(captured.filter((e) => e.type === 'connectionTestStillRunning')).toHaveLength(1);
  });

  it('never announces still-running when the request resolves before 3s', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true, modelCount: 3 }));
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(5000);

    expect(types()).not.toContain('connectionTestStillRunning');
  });

  it('announces ok with a pluralized count for modelCount > 0 and returns the matching outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true, modelCount: 14 }));
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);

    expect(captured).toContainEqual({ type: 'connectionTestOk', modelCount: 14 });
    expect(result.current.data).toEqual({ kind: 'ok', modelCount: 14 });
  });

  it('announces ok with modelCount 1 (singular handled in the speech channel)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true, modelCount: 1 }));
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);

    expect(captured).toContainEqual({ type: 'connectionTestOk', modelCount: 1 });
  });

  it('announces ok-no-listing for modelCount 0 and for an absent modelCount, returning that outcome', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true, modelCount: 0 }));
    const first = renderHook(() => useTestConnection(), { wrapper: wrapper() });
    first.result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);
    expect(types()).toContain('connectionTestOkNoListing');
    expect(first.result.current.data).toEqual({ kind: 'ok-no-listing' });

    captured.length = 0;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ ok: true }));
    const second = renderHook(() => useTestConnection(), { wrapper: wrapper() });
    second.result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);
    expect(types()).toContain('connectionTestOkNoListing');
    expect(second.result.current.data).toEqual({ kind: 'ok-no-listing' });
  });

  it('maps each server error code to its content-safe failure category', async () => {
    const cases: {
      code: 'unauthorized' | 'unreachable' | 'bad-config' | 'unknown';
      category: string;
    }[] = [
      { code: 'unauthorized', category: 'unauthorized' },
      { code: 'unreachable', category: 'unreachable' },
      { code: 'bad-config', category: 'error' },
      { code: 'unknown', category: 'error' },
    ];

    for (const { code, category } of cases) {
      captured.length = 0;
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        okResponse({ ok: false, error: { code, message: 'detail that must not surface' } }),
      );
      const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });
      result.current.mutate({ connectionId: 'c1' });
      await vi.advanceTimersByTimeAsync(100);

      expect(captured).toContainEqual({ type: 'connectionTestFailed', category });
      expect(result.current.data).toEqual({ kind: 'failed', category });
    }
  });

  it('yields connectionTestFailed{unreachable} when the ceiling aborts a hung request', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(8000);
    await vi.advanceTimersByTimeAsync(100);

    expect(captured).toContainEqual({ type: 'connectionTestFailed', category: 'unreachable' });
  });

  it('never leaks a secret, base URL, or header value in any captured event', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      okResponse({ ok: false, error: { code: 'unauthorized', message: 'Bearer sk-secret-123' } }),
    );
    const { result } = renderHook(() => useTestConnection(), { wrapper: wrapper() });

    result.current.mutate({ connectionId: 'c1' });
    await vi.advanceTimersByTimeAsync(100);

    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain('sk-secret-123');
    expect(serialized).not.toContain('Bearer');
    // Every captured event has only its documented fields (no message/baseUrl/header keys).
    for (const event of captured) {
      const keys = Object.keys(event).toSorted();
      const allowed = [['type'], ['modelCount', 'type'], ['category', 'type']];
      expect(allowed).toContainEqual(keys);
    }
  });
});
