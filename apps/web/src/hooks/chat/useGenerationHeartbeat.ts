import { useEffect, useRef } from 'react';

import type { GenerationPhase } from '../../lib/message/generationPhase';
import { notify } from '../../notifications/notifier';

/**
 * While `generating` is true, emit `generationStarted` once on entry and `generationProgress` with
 * the whole elapsed seconds every `periodMs`, tagging the tick with `thinking` while the turn is in
 * the thinking phase; clear the timer on leaving. The thinking lifecycle is announced once each:
 * `thinkingStarted` when a turn enters/transitions into thinking, and `thinkingComplete` (with the
 * whole elapsed thinking seconds) at the transition to the answer phase. `thinkingComplete` fires
 * ONLY on the thinking-to-answering transition, never when a turn ends (abort or error) while still
 * in the thinking phase - there the terminal `generationStopped`/error events from the chat
 * callbacks carry the outcome, so no phantom "Answering" transition is announced. Terminal events
 * (complete, stopped, error) are emitted from the chat callbacks, not here, because only those carry
 * the reason. Takes booleans/an enum (not the raw status string) so it stays decoupled from the chat
 * hook's status vocabulary.
 *
 * @param generating - Whether a response is currently generating.
 * @param periodMs - The heartbeat period in milliseconds.
 * @param phase - The current generation phase, derived from the in-flight message parts.
 */
export function useGenerationHeartbeat(
  generating: boolean,
  periodMs: number,
  phase: GenerationPhase,
): void {
  const startRef = useRef<number | null>(null);
  const thinkStartRef = useRef<number | null>(null);
  // Track the live phase in a ref so the interval closure reads the current value without
  // restarting the timer (which would reset the elapsed-seconds clock) on every phase change.
  const phaseRef = useRef<GenerationPhase>(phase);
  phaseRef.current = phase;

  // The heartbeat: emit `generationStarted` on entry and `generationProgress` every period. A turn
  // that begins already in the thinking phase opens the thinking lifecycle here (the phase effect
  // below does not re-run for an unchanged phase). The single `thinkingStarted` does not depend on
  // which effect runs first: the shared `thinkStartRef === null` guard means whichever effect runs
  // first sets the ref and fires once, and the other sees it non-null and skips (order-independent
  // and StrictMode-safe).
  useEffect(() => {
    if (!generating) {
      startRef.current = null;
      thinkStartRef.current = null;
      return undefined;
    }
    startRef.current = Date.now();
    notify({ type: 'generationStarted' });
    if (phaseRef.current === 'thinking' && thinkStartRef.current === null) {
      thinkStartRef.current = Date.now();
      notify({ type: 'thinkingStarted' });
    }

    const id = setInterval(() => {
      const start = startRef.current ?? Date.now();
      const seconds = Math.round((Date.now() - start) / 1000);
      // Tag the tick only while thinking; answer-phase ticks omit the flag entirely (rather than set
      // it to undefined) to satisfy exactOptionalPropertyTypes and keep the non-thinking event shape.
      notify(
        phaseRef.current === 'thinking'
          ? { type: 'generationProgress', seconds, thinking: true }
          : { type: 'generationProgress', seconds },
      );
    }, periodMs);

    return () => clearInterval(id);
  }, [generating, periodMs]);

  // The thinking lifecycle on each later phase change while generating: announce `thinkingStarted`
  // once on a transition into thinking and `thinkingComplete` once (with the elapsed thinking
  // seconds) at the transition to answering. Entry on mount is handled by the heartbeat effect
  // above, so this effect never double-fires the start.
  useEffect(() => {
    if (!generating) return undefined;
    if (phase === 'thinking' && thinkStartRef.current === null) {
      thinkStartRef.current = Date.now();
      notify({ type: 'thinkingStarted' });
    } else if (phase === 'answering' && thinkStartRef.current !== null) {
      const seconds = Math.round((Date.now() - thinkStartRef.current) / 1000);
      thinkStartRef.current = null;
      notify({ type: 'thinkingComplete', seconds });
    }
    return undefined;
  }, [generating, phase]);
}
