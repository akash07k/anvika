/** Options for {@link startDiagnosticsLifecycle}. */
export interface LifecycleOptions {
  /** Flush the batcher (fire-and-forget). */
  flush: () => void;
  /** Flush interval in milliseconds. */
  intervalMs: number;
  /**
   * Optional predicate checked after each flush; when it returns `true` the lifecycle tears itself
   * down (clears the timer, removes the listeners). Used to wind the timer down once diagnostics go
   * globally off, so nothing keeps ticking after the client has stopped POSTing.
   */
  shouldStop?: () => boolean;
}

/**
 * Start the diagnostic flush lifecycle: a periodic timer plus a flush whenever the page is hidden
 * (`visibilitychange` to hidden, and `pagehide`) so the final batch is delivered on unload. Returns
 * an idempotent stop function that clears the timer and removes the listeners (for tests and
 * teardown). If `shouldStop` is supplied and returns `true` after any flush, the lifecycle stops
 * itself; because the underlying off flag flips after the async POST resolves, that wind-down
 * happens on the next flush after the server signals off, not the same one.
 *
 * @param options - The flush callback, the interval, and an optional self-stop predicate.
 * @returns A stop function.
 */
export function startDiagnosticsLifecycle(options: LifecycleOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  function run(): void {
    options.flush();
    if (options.shouldStop?.()) stop();
  }
  function onHide(): void {
    if (document.visibilityState === 'hidden') run();
  }
  function onPageHide(): void {
    run();
  }
  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (timer !== undefined) clearInterval(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  }

  timer = setInterval(run, options.intervalMs);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return stop;
}
