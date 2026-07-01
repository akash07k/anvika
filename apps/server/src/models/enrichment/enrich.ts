import { z } from 'zod';

import { serverLogger } from '../../logging/logger';
import { type DiscoveryOptions } from '../discovery/shared';
import { type ModelMeta, ModelMetaSchema, NULL_META } from './meta';
import { fetchModelsDev } from './modelsdev';
import snapshot from './snapshot.json';

/** Schema for the committed snapshot: connection type -> bare model id -> {@link ModelMeta}. */
const SnapshotSchema = z.record(z.string(), z.record(z.string(), ModelMetaSchema));

/**
 * The committed offline snapshot: connection type -> bare model id -> {@link ModelMeta}. Parsed (not
 * cast) at module load, so a malformed committed snapshot fails loudly here rather than silently
 * feeding bad data into pricing.
 */
const SNAPSHOT = SnapshotSchema.parse(snapshot);

/** Options for {@link enrich}: an optional live-list override and an injectable fetch for tests. */
export interface EnrichOptions extends DiscoveryOptions {
  /** Metadata from the connection's own live list (OpenRouter/xAI carry it); highest priority. */
  override?: ModelMeta;
}

/**
 * The committed offline metadata for `(type, model)`, or null. Synchronous: reads only the bundled
 * snapshot (the offline price/context floor), so the chat finish seam can price a turn without awaiting
 * a network fetch.
 *
 * @param type - The connection type.
 * @param model - The bare model id.
 * @returns The snapshot {@link ModelMeta}, or null when absent.
 */
export function snapshotMeta(type: string, model: string): ModelMeta | null {
  return SNAPSHOT[type]?.[model] ?? null;
}

/** Whether every field of a {@link ModelMeta} is non-null (so no base fill is needed). */
function isComplete(meta: ModelMeta): boolean {
  return (
    meta.inputPrice !== null &&
    meta.outputPrice !== null &&
    meta.contextWindow !== null &&
    meta.maxOutputTokens !== null
  );
}

/**
 * Resolve the base metadata for `(type, model)`: a cached models.dev fetch, then the committed
 * snapshot, then all-null. Fail-soft; the only thrown error (models.dev unavailable) is caught and
 * logged at warning with a content-safe message (never a URL or secret).
 */
async function resolveBase(type: string, model: string, opts: EnrichOptions): Promise<ModelMeta> {
  const live = await fetchModelsDev(opts)
    .then((lookup) => lookup(type, model))
    .catch(() => {
      serverLogger('models').warn('models.dev enrichment unavailable; using snapshot');
      return null;
    });
  if (live) return live;
  return snapshotMeta(type, model) ?? NULL_META;
}

/**
 * Resolve a model's metadata via a PER-FIELD merge in priority order: the live-list override (wins on
 * each of its non-null fields) -> a cached models.dev fetch -> the committed snapshot -> all-null. A
 * complete override short-circuits the base fetch; an override with null fields fills those nulls from
 * the base, so a partial live list never clobbers good models.dev/snapshot data. models.dev and the
 * snapshot are keyed by connection type + bare model id; azure and unknown openai-compatible ids fall
 * through to null. Best-effort and fail-soft; never throws.
 *
 * @param type - The connection type (the models.dev provider key for native types).
 * @param model - The bare model id.
 * @param opts - Override + injectable fetch.
 * @returns The resolved {@link ModelMeta} (null fields when unknown).
 */
export async function enrich(
  type: string,
  model: string,
  opts: EnrichOptions = {},
): Promise<ModelMeta> {
  const override = opts.override;
  if (override && isComplete(override)) return override;
  const base = await resolveBase(type, model, opts);
  if (!override) return base;
  return {
    inputPrice: override.inputPrice ?? base.inputPrice,
    outputPrice: override.outputPrice ?? base.outputPrice,
    contextWindow: override.contextWindow ?? base.contextWindow,
    maxOutputTokens: override.maxOutputTokens ?? base.maxOutputTokens,
  };
}
