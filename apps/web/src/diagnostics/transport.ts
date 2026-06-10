import type { DiagnosticEntry } from '@anvika/shared/diagnostics/events';

/**
 * Result of one delivery attempt: delivered, retry-eligible, permanently undeliverable, or
 * disabled (the server signalled global off, so the client should stop POSTing entirely).
 */
export type TransportResult = 'ok' | 'retry' | 'poison' | 'disabled';

/**
 * POST a diagnostic batch to the single client logging endpoint. Uses `keepalive` so a flush on
 * page-hide still completes, and never throws: a network failure or 5xx is retry-eligible, a 400
 * (a batch the server will never accept) is poison, a 2xx carrying `x-anvika-diagnostics: off` is
 * disabled (global off), and any other 2xx is delivered.
 *
 * @param entries - The entries to deliver (already bounded by the caller).
 * @returns The {@link TransportResult} for this attempt.
 */
export async function postDiagnosticBatch(
  entries: readonly DiagnosticEntry[],
): Promise<TransportResult> {
  try {
    const res = await fetch('/api/v1/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
      keepalive: true,
    });
    if (res.ok) {
      return res.headers.get('x-anvika-diagnostics') === 'off' ? 'disabled' : 'ok';
    }
    return res.status === 400 ? 'poison' : 'retry';
  } catch {
    return 'retry';
  }
}
