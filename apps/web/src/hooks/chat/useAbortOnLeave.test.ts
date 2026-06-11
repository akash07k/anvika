import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAbortOnLeave } from './useAbortOnLeave';

describe('useAbortOnLeave', () => {
  it('aborts on unmount when the turn is streaming', () => {
    const stop = vi.fn();
    const { unmount } = renderHook(() => useAbortOnLeave({ isBusy: true, stop }));
    expect(stop).not.toHaveBeenCalled(); // not on mount
    unmount();
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

  it('reads the latest isBusy via ref: idle then streaming, unmount aborts', () => {
    const stop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ isBusy }: { isBusy: boolean }) => useAbortOnLeave({ isBusy, stop }),
      { initialProps: { isBusy: false } },
    );
    rerender({ isBusy: true });
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('calls the latest stop via ref when it changes between renders', () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ stop }: { stop: () => void }) => useAbortOnLeave({ isBusy: true, stop }),
      { initialProps: { stop: firstStop } },
    );
    rerender({ stop: secondStop });
    unmount();
    expect(firstStop).not.toHaveBeenCalled();
    expect(secondStop).toHaveBeenCalledTimes(1);
  });
});
