import type { DiagnosticBatch, DiagnosticEvent } from '@anvika/shared/diagnostics/events';
import { diagnosticMeta } from '@anvika/shared/diagnostics/registry';
import type { LogLevel } from '@anvika/shared/log-entry';

/** A single resolved write: where, how loudly, the message, and the structured fields. */
export interface DiagnosticLogCall {
  /** Category segments appended after `['anvika', 'client']`. */
  category: readonly string[];
  /** The level to write at. */
  level: LogLevel;
  /** The content-free message text. */
  message: string;
  /** Structured properties: the envelope (`seq`, `at`) plus the event's own scalar fields. */
  fields: Record<string, unknown>;
}

/** Options for {@link diagnosticLogCalls}. */
export interface DiagnosticLogOptions {
  /** Whether the operator opted into content logging; gates the optional milestone `text`. */
  logContent: boolean;
}

/** The event's own fields with `type` dropped and, unless content logging is on, any `text`
 *  stripped so response/error text is never written without the opt-in (server-side gate). */
function eventFields(event: DiagnosticEvent, logContent: boolean): Record<string, unknown> {
  const { type: _type, ...rest } = event;
  if (logContent) return rest;
  const { text: _text, ...withoutText } = rest as { text?: string } & Record<string, unknown>;
  return withoutText;
}

/**
 * Map a validated diagnostic batch to an ordered list of log calls. Pure and side-effect free so it
 * is unit-testable without LogTape. The discriminant `type` is dropped from the fields; `seq` and
 * `at` are promoted in; milestone `text` is included only when `options.logContent` is on.
 *
 * @param batch - The validated batch from the request body.
 * @param options - Whether content logging is enabled.
 * @returns One {@link DiagnosticLogCall} per entry, in batch order.
 */
export function diagnosticLogCalls(
  batch: DiagnosticBatch,
  options: DiagnosticLogOptions,
): DiagnosticLogCall[] {
  return batch.entries.map((entry) => {
    const meta = diagnosticMeta(entry.event);
    return {
      category: meta.category,
      level: meta.level,
      message: meta.message,
      fields: { seq: entry.seq, at: entry.at, ...eventFields(entry.event, options.logContent) },
    };
  });
}
