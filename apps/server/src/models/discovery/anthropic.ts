import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveryOptions } from './shared';

const AnthropicModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })).optional(),
});

/**
 * Discover an Anthropic connection's chat models via `GET {base}/v1/models` (`x-api-key` +
 * `anthropic-version` headers). Every listed model is a chat model, so no filter is applied and ids are
 * already bare. Zod-validated at the boundary; any failure yields `[]`. Never logs the key. Returns
 * BARE model ids.
 *
 * @param connection - The anthropic connection (must carry an apiKey; caller skips it otherwise).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered bare model ids, or `[]`.
 */
export async function discoverAnthropicModelIds(
  connection: Extract<Connection, { type: 'anthropic' }>,
  opts: DiscoveryOptions = {},
): Promise<string[]> {
  if (!connection.apiKey) return [];
  const { url, headers } = listingRequest(connection, connection.apiKey);
  const body = await fetchJson(url, { headers }, opts);
  const parsed = AnthropicModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.data) {
    serverLogger('models').debug('anthropic discovery returned no model list');
    return [];
  }
  return parsed.data.data.map((m) => m.id);
}
