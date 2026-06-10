import type { ClientLogEvent } from '@anvika/shared/client-log';
import type { DiagnosticEvent } from '@anvika/shared/diagnostics/events';

import { createBatcher, type Batcher } from './batcher';
import { postDiagnosticBatch } from './transport';

/** Largest in-flight buffer before the batcher drops oldest (memory safety valve, not a log cap). */
const MAX_QUEUE = 1000;
/** Largest number of entries delivered per POST (mirrors the server bound). */
const MAX_BATCH = 100;

/** Dependencies for {@link createDiagnostics}, injectable for tests. */
export interface DiagnosticsDeps {
  /** The batcher entries are enqueued into. */
  batcher: Batcher;
  /** Client clock (epoch ms); injectable so tests are deterministic. */
  now: () => number;
  /**
   * Shared monotonic seq source. The singleton passes the SAME counter to the batcher so main events
   * and self-reports never collide on `seq`. Defaults to an internal per-instance counter.
   */
  nextSeq?: () => number;
}

/** The diagnostics API: emit a typed event, or a folded-in milestone code. */
export interface Diagnostics {
  /** Emit a content-safe diagnostic event; stamped with a monotonic `seq` and the client time. */
  logDiag: (event: DiagnosticEvent) => void;
  /** Emit a notification milestone code, optionally with allow-listed content text. */
  clientLog: (code: ClientLogEvent, text?: string) => void;
  /** Flush the underlying batcher now (used by the lifecycle and on unload). */
  flush: () => Promise<void>;
  /** Whether diagnostics have gone permanently no-op after a server global-off signal. */
  isDisabled: () => boolean;
}

/**
 * Build the diagnostics API over a given batcher and clock. Each emitted event is wrapped in an
 * envelope with a monotonic per-session `seq` and the client `at` time, so order and timing survive
 * batching and retries. `clientLog(code)` is the thin producer that turns a notification milestone
 * into a `milestone` event on the same pipe.
 *
 * @param deps - The batcher and clock.
 * @returns The {@link Diagnostics} API.
 */
export function createDiagnostics(deps: DiagnosticsDeps): Diagnostics {
  let fallbackSeq = 0;
  const nextSeq = deps.nextSeq ?? ((): number => fallbackSeq++);
  function logDiag(event: DiagnosticEvent): void {
    deps.batcher.enqueue({ seq: nextSeq(), at: deps.now(), event });
  }
  return {
    logDiag,
    clientLog: (code, text) =>
      logDiag({ type: 'milestone', code, ...(text !== undefined ? { text } : {}) }),
    flush: () => deps.batcher.flush(),
    isDisabled: () => deps.batcher.isDisabled(),
  };
}

/**
 * One shared per-session monotonic counter for the singleton. Passing it to BOTH the batcher and
 * `createDiagnostics` guarantees main events and the batcher's self-reports draw from the same
 * sequence, so `seq` is session-unique and strictly increasing (the order signal the reader relies
 * on when `at` ties or batches are retried out of order).
 */
let seq = 0;
const nextSeq = (): number => seq++;

/** The process-wide diagnostics singleton, wired to the real transport, system clock, and shared seq. */
export const diagnostics: Diagnostics = createDiagnostics({
  batcher: createBatcher({
    post: postDiagnosticBatch,
    maxQueue: MAX_QUEUE,
    maxBatch: MAX_BATCH,
    nextSeq,
  }),
  now: () => Date.now(),
  nextSeq,
});

/** Emit a content-safe diagnostic event (module-level convenience over the singleton). */
export const logDiag = diagnostics.logDiag;
