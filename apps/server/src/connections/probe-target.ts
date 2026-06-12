import type { Connection } from '@anvika/shared/settings/connection';

import { type ListingRequest, listingRequest } from '../models/discovery/listing-endpoint';

/** The HTTP target for a connection's model-listing probe: the URL and request headers. */
export type ProbeTarget = ListingRequest;

/**
 * Build the model-listing probe target (URL + headers) for a connection, mirroring each type's live
 * discovery endpoint (docs/research/model-discovery.md). The test-connection service uses this because
 * it needs the raw HTTP status that the fail-soft discovery adapters discard. The probe allows an empty
 * key (so an unauthorized probe can still read the 401/403 status), so it passes `connection.apiKey ?? ''`
 * to the shared {@link listingRequest} builder. The returned URL/headers may contain the secret (Google
 * embeds the key in the query string; others use auth headers) and so must never be logged.
 *
 * @param connection - The connection to probe.
 * @returns The probe {@link ProbeTarget}.
 */
export function probeTarget(connection: Connection): ProbeTarget {
  return listingRequest(connection, connection.apiKey ?? '');
}
