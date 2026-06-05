import { useEffect, useRef, useState } from 'react';

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
  const controllerRef = useRef<AbortController | null>(null);
  controllerRef.current ??= new AbortController();
  const [, bump] = useState(0);

  useEffect(() => {
    if (controllerRef.current?.signal.aborted) {
      controllerRef.current = new AbortController();
      bump((n) => n + 1);
    }
    const controller = controllerRef.current;
    return () => controller?.abort();
  }, []);

  return controllerRef.current.signal;
}
