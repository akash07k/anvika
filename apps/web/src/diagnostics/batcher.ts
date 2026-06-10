import type { DiagnosticEntry, DiagnosticEvent } from '@anvika/shared/diagnostics/events';

import type { TransportResult } from './transport';

/** Construction options for {@link createBatcher}. */
export interface BatcherOptions {
  /** Delivery function (the real transport, or a fake in tests). */
  post: (entries: readonly DiagnosticEntry[]) => Promise<TransportResult>;
  /** Maximum entries held in the in-flight buffer before drop-oldest kicks in. */
  maxQueue: number;
  /** Maximum entries sent in a single POST. */
  maxBatch: number;
  /** Clock for self-report timestamps (epoch ms); defaults to `Date.now`. */
  now?: () => number;
  /**
   * Shared monotonic seq source for self-report envelopes. When provided (the singleton passes the
   * SAME counter the main events use), self-reports stay globally monotonic with main events and can
   * never collide on `seq`. Defaults to an internal non-negative counter.
   */
  nextSeq?: () => number;
}

/** A diagnostic batcher: enqueue content-safe entries, flush them with bounded-retry delivery. */
export interface Batcher {
  /** Add an entry to the in-flight buffer, evicting the oldest on overflow. */
  enqueue: (entry: DiagnosticEntry) => void;
  /** Deliver up to `maxBatch` entries; re-enqueue on retry, drop on poison. */
  flush: () => Promise<void>;
  /** Current buffered count (for tests and lifecycle checks). */
  size: () => number;
  /** Whether the batcher has gone permanently no-op after a `disabled` result (global off). */
  isDisabled: () => boolean;
}

/** Wrap a bare self-report event in a valid envelope (non-negative seq, real client time). */
function selfReport(event: DiagnosticEvent, seq: number, at: number): DiagnosticEntry {
  return { seq, at, event };
}

/**
 * Create a diagnostic batcher with a bounded in-flight buffer and robust delivery. Overflow drops
 * the oldest entries and queues a `logsDropped` self-report so the loss is visible. A flush sends
 * at most `maxBatch` entries; a retry result re-enqueues them (front) for the next flush - then
 * re-applies the drop-oldest bound, so a retry that lands on top of entries buffered during the
 * in-flight POST can never leave the queue over `maxQueue`. A poison (permanently rejected) batch
 * is dropped and a single `logTransportError` is queued. A flush already in progress is not started
 * again concurrently. A `disabled` result (the server signalled global off) clears the queue and
 * makes the batcher permanently no-op.
 *
 * @param options - The transport and the queue/batch bounds.
 * @returns A {@link Batcher}.
 */
export function createBatcher(options: BatcherOptions): Batcher {
  const now = options.now ?? (() => Date.now());
  const queue: DiagnosticEntry[] = [];
  let dropped = 0;
  let fallbackSeq = 0;
  // Self-reports share the session counter when one is injected, else fall back to a local
  // non-negative counter; either way the envelope's `seq >= 0` invariant holds.
  const nextSeq = options.nextSeq ?? ((): number => fallbackSeq++);
  let flushing = false;
  let disabled = false;

  /** Enforce the in-flight bound by dropping the oldest entries, counting each for self-report. */
  function trim(): void {
    while (queue.length > options.maxQueue) {
      queue.shift();
      dropped += 1;
    }
  }

  function enqueue(entry: DiagnosticEntry): void {
    if (disabled) return;
    queue.push(entry);
    trim();
  }

  function drainDroppedReport(): void {
    if (dropped > 0) {
      queue.unshift(selfReport({ type: 'logsDropped', count: dropped }, nextSeq(), now()));
      dropped = 0;
    }
  }

  async function flush(): Promise<void> {
    if (flushing || disabled) return;
    flushing = true;
    try {
      drainDroppedReport();
      if (queue.length === 0) return;
      const batch = queue.splice(0, options.maxBatch);
      const result = await options.post(batch);
      if (result === 'retry') {
        queue.unshift(...batch);
        trim();
      } else if (result === 'poison') {
        enqueue(selfReport({ type: 'logTransportError' }, nextSeq(), now()));
      } else if (result === 'disabled') {
        disabled = true;
        queue.length = 0;
      }
    } finally {
      flushing = false;
    }
  }

  return { enqueue, flush, size: () => queue.length, isDisabled: () => disabled };
}
