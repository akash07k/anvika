import { z } from 'zod';

import { TtlCache } from '../discovery/cache';
import { type DiscoveryOptions, fetchJson } from '../discovery/shared';
import { type ModelMeta } from './meta';

/** A lookup from (connection type, bare model id) to enrichable metadata, or null on miss. */
export type ModelsDevLookup = (type: string, model: string) => ModelMeta | null;

const ModelEntrySchema = z.object({
  cost: z.object({ input: z.number().optional(), output: z.number().optional() }).optional(),
  limit: z.object({ context: z.number().optional(), output: z.number().optional() }).optional(),
});

const ProviderEntrySchema = z.object({
  models: z.record(z.string(), ModelEntrySchema).optional(),
});

const ModelsDevSchema = z.record(z.string(), ProviderEntrySchema);

/** Connection type -> models.dev provider key aliases (xAI is published under both `xai` and `x-ai`). */
const PROVIDER_ALIASES: Record<string, string[]> = {
  xai: ['xai', 'x-ai'],
};

const MODELS_DEV_URL = 'https://models.dev/api.json';
const TTL_MS = 30 * 60 * 1000;
const cache = new TtlCache<ModelsDevLookup>(TTL_MS);

/**
 * Drop the cached models.dev catalog so the next {@link fetchModelsDev} re-pulls it. Called by the
 * manual models refresh so refreshed models carry current pricing/limits immediately. The
 * catalog is public and keyless, so this leaks nothing; on a failed re-pull the fail-soft cache keeps
 * the last good catalog.
 */
export function bustModelsDevCache(): void {
  cache.invalidate('catalog');
}

function toMeta(entry: z.infer<typeof ModelEntrySchema>): ModelMeta {
  return {
    inputPrice: entry.cost?.input ?? null,
    outputPrice: entry.cost?.output ?? null,
    contextWindow: entry.limit?.context ?? null,
    maxOutputTokens: entry.limit?.output ?? null,
  };
}

/**
 * Fetch and cache the public models.dev catalog (api.json), returning a `(type, model) -> ModelMeta`
 * lookup. Cached ~30 min with fail-soft reuse of the last good catalog. Zod-validated at the boundary;
 * throws when there is no cached catalog AND the fetch/parse fails, so the caller falls through to the
 * committed snapshot. The catalog is public and keyless, so no secret is ever sent or logged.
 *
 * @param opts - Injectable fetch/timeout for tests.
 * @returns A lookup closure over the cached catalog.
 */
export function fetchModelsDev(opts: DiscoveryOptions = {}): Promise<ModelsDevLookup> {
  return cache.get('catalog', async () => {
    const body = await fetchJson(MODELS_DEV_URL, {}, opts);
    const parsed = ModelsDevSchema.safeParse(body);
    if (!parsed.success) throw new Error('models.dev catalog unavailable or malformed');
    const catalog = parsed.data;
    return (type, model) => {
      const keys = PROVIDER_ALIASES[type] ?? [type];
      for (const key of keys) {
        const entry = catalog[key]?.models?.[model];
        if (entry) return toMeta(entry);
      }
      return null;
    };
  });
}
