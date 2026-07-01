import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';
import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { testConnection } from '../../connections/test-service';
import type { DiscoveredModel, DiscoveryOptions } from './shared';

/** The discovery outcome value (the `outcome` field of {@link ConnectionDiscoveryStatus}). */
export type DiscoveryOutcome = ConnectionDiscoveryStatus['outcome'];

/** Connection types with no data-plane model listing; their membership comes only from manual ids. */
const NO_LISTING_TYPES: ReadonlySet<string> = new Set(['azure']);

/** The short timeout (ms) for the passive outcome probe, so the models endpoint never hangs on it. */
const PROBE_TIMEOUT_MS = 2000;

/**
 * Categorize one connection's live-discovery outcome WITHOUT a second network call on
 * the healthy path: when live discovery already returned models the outcome is `ok`; a no-listing
 * type (azure) is always `ok`. Only when the live list is empty does it probe the listing endpoint -
 * reusing the content-safe {@link testConnection} categorizer - to distinguish `empty` from
 * `unreachable` / `unauthorized` / `error`. The outcome reflects the LIVE attempt's reachability
 * and is independent of the connection's manual ids (an unreachable server with manual ids still
 * reports `unreachable`).
 *
 * @param connection - The connection (server-side, plaintext).
 * @param discovered - The live-discovered models for this connection (pre-union with manual ids).
 * @param deps - Injectable fetch/timeout (tests supply a fake fetch); reused for the probe.
 * @returns The content-safe discovery outcome.
 */
export async function resolveDiscoveryOutcome(
  connection: Connection,
  discovered: DiscoveredModel[],
  deps: DiscoveryOptions,
): Promise<DiscoveryOutcome> {
  if (discovered.length > 0) return 'ok';
  if (NO_LISTING_TYPES.has(connection.type)) return 'ok';

  const probeDeps = {
    ...(deps.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
    timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS,
  };
  const probe = await testConnection({ connection }, probeDeps);

  if (probe.ok) return (probe.modelCount ?? 0) > 0 ? 'ok' : 'empty';
  const code = probe.error?.code;
  const outcome: DiscoveryOutcome =
    code === 'unauthorized' ? 'unauthorized' : code === 'unreachable' ? 'unreachable' : 'error';
  serverLogger('models').debug('discovery outcome probe failed', {
    connectionId: connection.id,
    connectionType: connection.type,
    outcome,
  });
  return outcome;
}
