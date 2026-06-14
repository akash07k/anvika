import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import type { ModelMeta } from '../enrichment/meta';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveredModel, type DiscoveryOptions } from './shared';

const OpenRouterModelsSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        architecture: z.object({ output_modalities: z.array(z.string()).optional() }).optional(),
        pricing: z.object({ prompt: z.string(), completion: z.string() }).partial().optional(),
        context_length: z.number().optional(),
        top_provider: z
          .object({ max_completion_tokens: z.number().nullable() })
          .partial()
          .optional(),
      }),
    )
    .optional(),
});

/** One parsed OpenRouter model entry (post-Zod), used to build a {@link DiscoveredModel}. */
type OpenRouterModel = NonNullable<z.infer<typeof OpenRouterModelsSchema>['data']>[number];

/** Whether a model can output text (offerable for a text turn); default-keep when the field is absent. */
function outputsText(modalities: string[] | undefined): boolean {
  if (!Array.isArray(modalities)) return true;
  return modalities.includes('text');
}

/**
 * Convert an OpenRouter per-token USD price string to USD per MILLION tokens. OpenRouter returns
 * `pricing.prompt`/`pricing.completion` as decimal strings of USD per single token (verified against
 * the official `/api/v1/models` docs: e.g. GPT-4 `prompt: "0.00003"` = $30/million). Guards
 * empty/NaN/negative to null so a bad value never becomes a bogus price.
 */
function toPerMillion(price: string | undefined): number | null {
  if (typeof price !== 'string' || price.trim() === '') return null;
  const value = Number.parseFloat(price);
  if (!Number.isFinite(value) || value < 0) return null;
  return value * 1_000_000;
}

/** A positive context/output token count, or null (guards NaN and non-positive, incl. a reported 0). */
function toTokenCount(count: number | null | undefined): number | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return null;
  return count;
}

/** Build live {@link ModelMeta} from a parsed entry, or `undefined` when no field is mappable. */
function toMeta(model: OpenRouterModel): ModelMeta | undefined {
  const meta: ModelMeta = {
    inputPrice: toPerMillion(model.pricing?.prompt),
    outputPrice: toPerMillion(model.pricing?.completion),
    contextWindow: toTokenCount(model.context_length),
    maxOutputTokens: toTokenCount(model.top_provider?.max_completion_tokens),
  };
  if (
    meta.inputPrice === null &&
    meta.outputPrice === null &&
    meta.contextWindow === null &&
    meta.maxOutputTokens === null
  ) {
    return undefined;
  }
  return meta;
}

/**
 * Discover an OpenRouter connection's chat models via `GET https://openrouter.ai/api/v1/models` (Bearer
 * key), dropping non-text-output models. OpenRouter ids are already bare (e.g. `vendor/model`) and
 * survive the first-colon registry split, so they are not prefixed. The listing carries inline
 * pricing/context, so each model also gets live {@link ModelMeta} (USD per million; omitted when no
 * field is mappable) for the highest-priority enrichment override. Zod-validated at the boundary; any
 * failure yields `[]`. Never logs the key.
 *
 * @param connection - The openrouter connection (must carry an apiKey; caller skips it otherwise).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered models (bare id plus optional live meta), or `[]`.
 */
export async function discoverOpenRouterModels(
  connection: Extract<Connection, { type: 'openrouter' }>,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  if (!connection.apiKey) return [];
  const { url, headers } = listingRequest(connection, connection.apiKey);
  const body = await fetchJson(url, { headers }, opts);
  const parsed = OpenRouterModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.data) {
    serverLogger('models').debug('openrouter discovery returned no model list');
    return [];
  }
  return parsed.data.data
    .filter((m) => outputsText(m.architecture?.output_modalities))
    .map((m) => {
      const meta = toMeta(m);
      return meta ? { id: m.id, meta } : { id: m.id };
    });
}
