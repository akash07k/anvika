import { APICallError } from 'ai';

import { errorCauseDetail } from './error-cause';

/**
 * Map a provider `APICallError`'s HTTP status to a short, content-safe, actionable category. Reads
 * only the numeric `statusCode` (never the raw provider message text, which could echo input), so
 * nothing content-bearing crosses the boundary. The provider's full detail stays in the server
 * `stream error` log line (with the turn's `requestId`), which this message points the operator to.
 *
 * @param status - The provider error's HTTP status code, or undefined when the SDK did not surface one.
 * @returns A content-safe category message.
 */
function providerStatusMessage(status: number | undefined): string {
  if (status === 401 || status === 403) {
    return 'The model provider rejected the request (authentication or permissions). Check the connection API key and access in Settings.';
  }
  if (status === 404) {
    return 'The model provider could not find the model or deployment. Check the selected model id (for Azure, the deployment name) in Settings.';
  }
  if (status === 429) {
    return 'The model provider rate-limited the request. Wait a moment and try again.';
  }
  if (status !== undefined && status >= 500) {
    return `The model provider had a server error (HTTP ${status}). Try again shortly.`;
  }
  if (status !== undefined) {
    return `The model provider rejected the request (HTTP ${status}). The server log has the provider detail for this turn.`;
  }
  return 'The model provider returned an error. The server log has the provider detail for this turn.';
}

const THINKING_PARAMS_HINT =
  ' If this is a local server that rejects unknown request fields, turn off "Send extended thinking parameters" for this connection in Settings.';

/**
 * Map an arbitrary thrown value to a short, content-safe, category message for the client. A
 * provider/API error (detected by CLASS via `APICallError.isInstance`) is mapped to an actionable
 * category by its HTTP `statusCode` (see {@link providerStatusMessage}); everything else falls
 * through to a generic default. This reads the error class and its numeric status only, never the
 * raw message text, so the provider's message never crosses the boundary - it stays in the server
 * `stream error` log line (which carries the turn's `requestId`). The correlation reference is
 * deliberately NOT part of this string: the client composes the on-screen "Reference: <id>" from its
 * own per-turn id (shown, not spoken), so this message stays a clean, speakable category.
 *
 * Total by construction: any input that is not an `APICallError` falls through to the default, so the
 * caller (the AI SDK `onError`) always gets a string.
 *
 * When `localThinkingParamsSent` is `true` and the status is 400, a content-safe, fixed hint is
 * appended pointing the user at the per-connection "Send extended thinking parameters" toggle in
 * Settings. The hint is plain ASCII and contains no provider message text, no secrets, and no
 * reasoning content.
 *
 * @param error - The value thrown into the stream (a provider error, or anything else).
 * @param localThinkingParamsSent - Whether the turn sent local `chat_template_kwargs` thinking
 *   params; when `true` a 400 response gets an actionable hint. Defaults to `false`.
 * @returns A content-safe category message.
 */
export function safeChatErrorMessage(error: unknown, localThinkingParamsSent = false): string {
  const withHint = (base: string, status: number | undefined): string =>
    status === 400 && localThinkingParamsSent ? base + THINKING_PARAMS_HINT : base;
  if (APICallError.isInstance(error)) {
    return withHint(providerStatusMessage(error.statusCode), error.statusCode);
  }
  // A wrapped error (e.g. the SDK RetryError after retried 429s) hides the provider failure from
  // `APICallError.isInstance`; unwrap to the deepest cause's status so a rate-limit/auth/not-found
  // still maps to its actionable category instead of the generic default.
  const cause = errorCauseDetail(error);
  if (cause?.statusCode !== undefined) {
    return withHint(providerStatusMessage(cause.statusCode), cause.statusCode);
  }
  return 'The chat request failed unexpectedly.';
}
