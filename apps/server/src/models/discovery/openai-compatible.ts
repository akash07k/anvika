import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveryOptions } from './shared';

const OpenAiCompatibleModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })).optional(),
});

/**
 * Discover an openai-compatible connection's models via `GET {baseUrl}/models`. Sends `Authorization:
 * Bearer` only when an apiKey is set, and forwards any custom `headers` (plaintext at this layer; never
 * logged). Many compatible endpoints expose no listing, so a missing/empty list yields `[]`. Zod-
 * validated at the boundary; any failure yields `[]`. Returns BARE model ids.
 *
 * @param connection - The openai-compatible connection (carries a required baseUrl).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered bare model ids, or `[]`.
 */
export async function discoverOpenAiCompatibleModelIds(
  connection: Extract<Connection, { type: 'openai-compatible' }>,
  opts: DiscoveryOptions = {},
): Promise<string[]> {
  const { url, headers } = listingRequest(connection, connection.apiKey ?? '');
  const body = await fetchJson(url, { headers }, opts);
  const parsed = OpenAiCompatibleModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.data) {
    serverLogger('models').debug('openai-compatible discovery returned no model list');
    return [];
  }
  return parsed.data.data.map((m) => m.id);
}
