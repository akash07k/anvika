import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';
import type { ConnectionType } from '@anvika/shared/settings/connection';

/** The discovery outcome value. */
type Outcome = ConnectionDiscoveryStatus['outcome'];

/**
 * Whether an outcome is a LOAD problem (raises the picker pointer and the transition
 * announcement). True for `unreachable`, `unauthorized`, and `error`; false for `ok` and
 * `empty`.
 *
 * @param outcome - The discovery outcome to test.
 * @returns `true` if the outcome represents a failed load.
 */
export function isLoadProblem(outcome: Outcome): boolean {
  return outcome === 'unreachable' || outcome === 'unauthorized' || outcome === 'error';
}

/**
 * The on-screen status message for one connection's discovery outcome, tailored by
 * connection type, or `null` when there is nothing to say (`ok`, or a non-local `empty`).
 *
 * The `baseUrl` is shown only in the local (`openai-compatible`) unreachable message - this is
 * intentional: it is the owner's own configured URL displayed on their own screen. It is NEVER
 * spoken in announcements (which use labels only) and NEVER logged. Do not interpolate `baseUrl`
 * into any other branch.
 *
 * The `empty` outcome yields a hint only for the `openai-compatible` type, since cloud providers
 * returning an empty model list is unusual and not actionable from the client.
 *
 * @param type - The connection type.
 * @param outcome - The discovery outcome.
 * @param label - The connection's content-safe display label.
 * @param baseUrl - The connection's configured base URL (used only for local unreachable message).
 * @returns The status message string, or `null` when there is nothing to show.
 */
export function discoveryStatusMessage(
  type: ConnectionType,
  outcome: Outcome,
  label: string,
  baseUrl?: string,
): string | null {
  switch (outcome) {
    case 'unreachable':
      return type === 'openai-compatible' && baseUrl
        ? `Could not reach your local server at ${baseUrl}. Is it running?`
        : `Could not reach ${label}.`;
    case 'unauthorized':
      return `${label}: the API key was rejected.`;
    case 'error':
      return `${label}: could not load models.`;
    case 'empty':
      return type === 'openai-compatible'
        ? `${label} is reachable but has no models loaded.`
        : null;
    default:
      return null;
  }
}
