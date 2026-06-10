/** A minimal record guard so fields can be read off an unknown error without `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** A content-bounded summary of one error in a cause chain. */
export interface ErrorCauseDetail {
  /** The error's `name` (e.g. `APICallError`, `TypeError`), when present. */
  name?: string;
  /** The error's `message`, truncated to keep the log line bounded. */
  message?: string;
  /** The provider HTTP `statusCode`, when the underlying error carries one. */
  statusCode?: number;
}

/** The maximum length of a logged cause message (keeps a single log line bounded). */
const MAX_MESSAGE_LEN = 300;

/**
 * Walk an error's wrapper chain (`lastError` for the AI SDK `RetryError`, then standard `cause`) to
 * the deepest underlying error and return a content-bounded summary of it. Wrapped errors hide the
 * real failure: a `RetryError`'s `String()` flattens to "Failed after 3 attempts. Last error: Error",
 * which is undiagnosable. This surfaces the deepest error's `name`, a length-bounded `message`, and
 * `statusCode` so the operator can see what the provider actually returned (model not found, auth,
 * overloaded, network failure, and so on).
 *
 * Operational only: this is an ERROR summary for the server log, never prompt or response text. The
 * message is truncated to {@link MAX_MESSAGE_LEN}. Returns undefined when the error has no nested
 * cause (the top-level `String(error)` already carries everything in that case).
 *
 * @param error - The thrown value (possibly a wrapper such as `RetryError`).
 * @returns The deepest cause summary, or undefined when there is no wrapped cause.
 */
export function errorCauseDetail(error: unknown): ErrorCauseDetail | undefined {
  let current: unknown = error;
  let depth = 0;
  // Descend through wrappers. Bounded depth so a cyclic or pathological chain cannot loop forever.
  while (depth < 6 && isRecord(current)) {
    const next = current['lastError'] ?? current['cause'];
    if (next === undefined || next === null) break;
    current = next;
    depth += 1;
  }
  if (depth === 0 || !isRecord(current)) return undefined;
  const name = typeof current['name'] === 'string' ? current['name'] : undefined;
  const rawMessage = current['message'];
  const message = typeof rawMessage === 'string' ? rawMessage.slice(0, MAX_MESSAGE_LEN) : undefined;
  const statusCode = typeof current['statusCode'] === 'number' ? current['statusCode'] : undefined;
  return {
    ...(name !== undefined ? { name } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(statusCode !== undefined ? { statusCode } : {}),
  };
}
