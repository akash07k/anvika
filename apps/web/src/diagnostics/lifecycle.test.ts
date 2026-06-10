import { afterEach, describe, expect, it, vi } from 'vitest';

import { startDiagnosticsLifecycle } from './lifecycle';

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('startDiagnosticsLifecycle', () => {
  it('flushes on the interval and on a hide event, and stops cleanly', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const stop = startDiagnosticsLifecycle({ flush, intervalMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(flush).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(1);
    stop();
    vi.advanceTimersByTime(5000);
    const afterStop = flush.mock.calls.length;
    vi.advanceTimersByTime(5000);
    expect(flush.mock.calls.length).toBe(afterStop);
  });

  it('flushes when the page becomes hidden, but not while visible', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const stop = startDiagnosticsLifecycle({ flush, intervalMs: 100_000 }); // long, won't auto-fire
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('flushes on pagehide', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const stop = startDiagnosticsLifecycle({ flush, intervalMs: 100_000 });
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops itself once shouldStop reports true after a flush', () => {
    vi.useFakeTimers();
    let off = false;
    const flush = vi.fn(() => {
      off = true; // the flush that turns diagnostics globally off
    });
    const stop = startDiagnosticsLifecycle({ flush, intervalMs: 1000, shouldStop: () => off });
    vi.advanceTimersByTime(1000); // tick 1: flush sets off, shouldStop() -> the lifecycle self-stops
    expect(flush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000); // timer cleared: no further ticks
    expect(flush).toHaveBeenCalledTimes(1);
    stop(); // idempotent: a second stop after a self-stop is a true no-op
    vi.advanceTimersByTime(5000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('self-stops via a hide event when shouldStop reports true (not only the timer)', () => {
    vi.useFakeTimers();
    let off = false;
    const flush = vi.fn(() => {
      off = true;
    });
    startDiagnosticsLifecycle({ flush, intervalMs: 100_000, shouldStop: () => off }); // timer won't fire
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange')); // flush sets off, then self-stop
    expect(flush).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange')); // listener removed: no further flush
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('never self-stops when no shouldStop predicate is supplied', () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const stop = startDiagnosticsLifecycle({ flush, intervalMs: 1000 }); // no shouldStop
    vi.advanceTimersByTime(3000);
    expect(flush).toHaveBeenCalledTimes(3); // keeps ticking; the optional predicate is a no-op
    stop();
  });
});
