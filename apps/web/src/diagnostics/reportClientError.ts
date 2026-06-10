import { ApiClientError } from '../lib/api-client';
import { logDiag } from './logDiag';

/**
 * Derive a content-safe, bounded name for a client error: the server error CODE for a typed
 * {@link ApiClientError} (HTTP failures), otherwise the error's CLASS name (mid-stream failures).
 * Never the message text, so no content crosses the diagnostic boundary.
 *
 * @param error - The caught error (an {@link ApiClientError}, an `Error`, or anything thrown).
 * @returns A short, content-free identifier for the failure.
 */
export function clientErrorName(error: unknown): string {
  if (error instanceof ApiClientError) return error.code;
  if (error instanceof Error) return error.name;
  return 'Error';
}

/**
 * Emit a content-safe `clientError` diagnostic for a failed chat turn, tagged with the turn's
 * correlation id so it ties to the server's `anvika.server.chat` line for the same turn - the
 * correlation that survives even when the SDK hides the raw cause from the client. The id is passed
 * in (read from the component's per-turn ref) so this stays a pure producer with no module state.
 *
 * @param error - The error surfaced by the chat hook.
 * @param requestId - The current turn's correlation id; omitted from the event when empty.
 */
export function reportClientError(error: unknown, requestId: string): void {
  logDiag({
    type: 'clientError',
    name: clientErrorName(error),
    // An empty id must be OMITTED, not set: the shared schema rejects '' (min(1)) and
    // exactOptionalPropertyTypes forbids `requestId: undefined`. Do not "simplify" to an always-set key.
    ...(requestId ? { requestId } : {}),
  });
}
