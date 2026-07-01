import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveryOptions } from './shared';

const GoogleModelsSchema = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        supportedGenerationMethods: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

/**
 * Discover a Google connection's chat models via `GET {base}/v1beta/models?key=KEY`, keeping only
 * entries whose `supportedGenerationMethods` includes `generateContent` and stripping the `models/`
 * prefix. Zod-validated at the boundary; any failure (non-200, bad shape) yields `[]`. Never logs the
 * key. Returns BARE model ids.
 *
 * @param connection - The google connection (must carry an apiKey; caller skips it otherwise).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered bare model ids, or `[]`.
 */
export async function discoverGoogleModelIds(
  connection: Extract<Connection, { type: 'google' }>,
  opts: DiscoveryOptions = {},
): Promise<string[]> {
  if (!connection.apiKey) return [];
  const { url, headers } = listingRequest(connection, connection.apiKey);
  const body = await fetchJson(url, { headers }, opts);
  const parsed = GoogleModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.models) {
    serverLogger('models').debug('google discovery returned no model list');
    return [];
  }
  return parsed.data.models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') ?? false)
    .map((m) => m.name.replace(/^models\//, ''));
}
