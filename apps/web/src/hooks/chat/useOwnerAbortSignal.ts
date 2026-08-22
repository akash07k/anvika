import { useEffect, useState, useSyncExternalStore } from 'react';

class OwnerAbortLifecycle {
  #controller = new AbortController();
  #listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSignal = (): AbortSignal => this.#controller.signal;

  resetIfAborted = (): void => {
    if (!this.#controller.signal.aborted) return;
    this.#controller = new AbortController();
    for (const listener of this.#listeners) listener();
  };

  abort = (): void => this.#controller.abort();
}

/**
 * Provide an owner-lifetime {@link AbortSignal} that aborts when the calling component unmounts.
 *
 * A consumer threads the returned signal into work whose late side effects must be cancelled once
 * the owner is gone - e.g. an in-flight connection test whose outcome announcement must be silenced
 * after the form unmounts, so a stale "OK/failed" never contradicts a "saved" the user already
 * heard. The signal is stable across normal re-renders.
 *
 * StrictMode-safe: React's dev-only setup+cleanup double-invoke aborts the first controller before
 * any real work runs. The effect detects an already-aborted controller on its next setup, replaces
 * it, and forces a single re-render so the consumer re-captures the live signal.
 *
 * @returns A stable {@link AbortSignal} aborted on unmount.
 */
export function useOwnerAbortSignal(): AbortSignal {
  const [lifecycle] = useState(() => new OwnerAbortLifecycle());

  useEffect(() => {
    lifecycle.resetIfAborted();
    return () => lifecycle.abort();
  }, [lifecycle]);

  return useSyncExternalStore(lifecycle.subscribe, lifecycle.getSignal, lifecycle.getSignal);
}
