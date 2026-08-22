import { useEffect, useEffectEvent, useRef } from 'react';

/** Inputs for {@link useAbortOnLeave}. */
export interface AbortOnLeaveInput {
  /** Whether a turn is in flight - `submitted` OR `streaming`, the states in which leaving must abort. */
  isBusy: boolean;
  /** Aborts the active response; for an in-flight turn this is `useChat`'s `Chat.stop()`. */
  stop: () => void | Promise<void>;
}

/**
 * Abort the in-flight turn when the user leaves a streaming conversation.
 *
 * `ConversationView` is rendered keyed by `conversationId`, so navigating to a different `/c/:id`
 * (or off the `/c` route) UNMOUNTS it. React's unmount cleanup is therefore the exact, reliable
 * "navigated away from this conversation" signal - we use it rather than coupling to TanStack
 * Router navigation/`useBlocker`/`beforeLoad`, which the keyed-remount approach makes unnecessary.
 *
 * On unmount, when a turn is in flight, this calls `stop()`. `useChat` does NOT abort its
 * underlying `Chat` on unmount, and that `Chat` (keyed by `conversationId`) persists with its
 * in-flight request still running; `stop()` aborts it so the server persists the partial turn
 * instead of streaming on in the background. The announcement ("Generation stopped")
 * is delivered by the existing `onFinish({ isAbort: true })` path on the persistent `Chat`, NOT
 * by this hook - calling `notify`/`announce` here would double-announce.
 *
 * Navigating while idle does nothing. A cleanup generation distinguishes a real unmount from the
 * development-only StrictMode setup-cleanup-setup probe, while the latest input is published from
 * an effect rather than read during render.
 *
 * @param input - The live in-flight state and the abort callback.
 */
export function useAbortOnLeave({ isBusy, stop }: AbortOnLeaveInput): void {
  const latestInputRef = useRef({ isBusy, stop });
  const cleanupGenerationRef = useRef(0);

  useEffect(() => {
    latestInputRef.current = { isBusy, stop };
  }, [isBusy, stop]);
  const abortLatestOnLeave = useEffectEvent(() => {
    const latestInput = latestInputRef.current;
    if (latestInput.isBusy) void latestInput.stop();
  });
  const isCurrentCleanupGeneration = useEffectEvent(
    (generation: number) => cleanupGenerationRef.current === generation,
  );

  useEffect(() => {
    const generation = ++cleanupGenerationRef.current;

    return () => {
      queueMicrotask(() => {
        // StrictMode replays cleanup and setup on this instance before microtasks run. A real
        // unmount has no subsequent setup, so only it retains the captured generation.
        if (!isCurrentCleanupGeneration(generation)) return;
        abortLatestOnLeave();
      });
    };
  }, []);
}
