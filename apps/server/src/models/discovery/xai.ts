import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveredModel, type DiscoveryOptions } from './shared';

const XaiModelsSchema = z.object({
  models: z
    .array(
      z.object({
        id: z.string(),
        output_modalities: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

/** Whether a model can output text (offerable for a text turn); default-keep when the field is absent. */
function outputsText(modalities: string[] | undefined): boolean {
  if (!Array.isArray(modalities)) return true;
  return modalities.includes('text');
}

/**
 * Discover an xAI connection's chat models via `GET {base}/v1/language-models` (Bearer key), keeping
 * only entries whose `output_modalities` includes `text` (default-keep when absent). The listing also
 * carries price/context fields, but their UNITS are not confirmable against official docs (the xAI docs
 * site is a client-rendered SPA; the price scale is only flagged, not verified). Per the unit-safety
 * rule a wrong conversion is worse than none, so this adapter attaches NO live meta yet and returns
 * bare ids; enrichment then falls through to models.dev/snapshot as before. Zod-validated at the
 * boundary; any failure yields `[]`. Never logs the key.
 *
 * @param connection - The xai connection (must carry an apiKey; caller skips it otherwise).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered models (bare id only for now), or `[]`.
 */
export async function discoverXaiModels(
  connection: Extract<Connection, { type: 'xai' }>,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  if (!connection.apiKey) return [];
  const { url, headers } = listingRequest(connection, connection.apiKey);
  const body = await fetchJson(url, { headers }, opts);
  const parsed = XaiModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.models) {
    serverLogger('models').debug('xai discovery returned no model list');
    return [];
  }
  return parsed.data.models
    .filter((m) => outputsText(m.output_modalities))
    .map((m) => ({ id: m.id }));
}
