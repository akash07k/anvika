import { renderHook } from '@testing-library/react';
import { createElement, StrictMode, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAbortOnLeave } from './useAbortOnLeave';

function flushCleanupMicrotask(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function strictModeWrapper({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children);
}

describe('useAbortOnLeave', () => {
  it('aborts on unmount when the turn is streaming', async () => {
    const stop = vi.fn();
    const { unmount } = renderHook(() => useAbortOnLeave({ isBusy: true, stop }));
    expect(stop).not.toHaveBeenCalled(); // not on mount
    unmount();
    await flushCleanupMicrotask();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does NOT abort on unmount when idle', () => {
    const stop = vi.fn();
    const { unmount } = renderHook(() => useAbortOnLeave({ isBusy: false, stop }));
    unmount();
    expect(stop).not.toHaveBeenCalled();
  });

  it('does NOT abort on mount or re-render - only on unmount', () => {
    const stop = vi.fn();
    const { rerender } = renderHook(
      ({ isBusy }: { isBusy: boolean }) => useAbortOnLeave({ isBusy, stop }),
      { initialProps: { isBusy: true } },
    );
    rerender({ isBusy: true });
    expect(stop).not.toHaveBeenCalled();
  });

  it('reads the latest isBusy via ref: streaming then idle, unmount does NOT abort', () => {
    const stop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ isBusy }: { isBusy: boolean }) => useAbortOnLeave({ isBusy, stop }),
      { initialProps: { isBusy: true } },
    );
    rerender({ isBusy: false });
    unmount();
    expect(stop).not.toHaveBeenCalled();
  });

  it('reads the latest isBusy via ref: idle then streaming, unmount aborts', async () => {
    const stop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ isBusy }: { isBusy: boolean }) => useAbortOnLeave({ isBusy, stop }),
      { initialProps: { isBusy: false } },
    );
    rerender({ isBusy: true });
    unmount();
    await flushCleanupMicrotask();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('calls the latest stop via ref when it changes between renders', async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ stop }: { stop: () => void }) => useAbortOnLeave({ isBusy: true, stop }),
      { initialProps: { stop: firstStop } },
    );
    rerender({ stop: secondStop });
    unmount();
    await flushCleanupMicrotask();
    expect(firstStop).not.toHaveBeenCalled();
    expect(secondStop).toHaveBeenCalledTimes(1);
  });

  it('does not mistake the StrictMode probe for leaving, then aborts once on final unmount', async () => {
    const firstStop = vi.fn();
    const latestStop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ stop }: { stop: () => void }) => useAbortOnLeave({ isBusy: true, stop }),
      { initialProps: { stop: firstStop }, wrapper: strictModeWrapper },
    );

    await flushCleanupMicrotask();
    expect(firstStop).not.toHaveBeenCalled();

    rerender({ stop: latestStop });
    unmount();
    await flushCleanupMicrotask();

    expect(firstStop).not.toHaveBeenCalled();
    expect(latestStop).toHaveBeenCalledTimes(1);
  });
});
