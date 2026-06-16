import type { Settings } from '@anvika/shared/settings/schema';

import { connectionTypeFor, parseModelId } from './connection-type';
import { snapshotMeta } from './enrichment/enrich';

/** A per-million-token price snapshot in USD. */
export interface ModelPrice {
  /** Input price, USD per million tokens. */
  input: number;
  /** Output price, USD per million tokens. */
  output: number;
  /** Currency; USD. */
  currency: 'USD';
}

/**
 * The per-million-token USD price for a namespaced `connectionId:model` id, or null when unknown or
 * unpriced. Maps the connection id to its TYPE via settings, then looks up `(type, bareModel)` in the
 * committed enrichment snapshot (the offline price authority); requires both prices to be finite
 * numbers. openai-compatible and azure ids without a snapshot row return null (cost omitted). Used at
 * the chat finish seam to snapshot the rate that applied when a turn ran.
 *
 * @param modelId - The namespaced `connectionId:model` id.
 * @param settings - The validated settings (to resolve the connection's type).
 * @returns The {@link ModelPrice}, or null.
 */
export function priceForModelId(modelId: string, settings: Settings): ModelPrice | null {
  const parsed = parseModelId(modelId);
  if (!parsed) return null;
  const type = connectionTypeFor(settings, parsed.connectionId);
  if (!type) return null;
  const meta = snapshotMeta(type, parsed.model);
  if (!meta || typeof meta.inputPrice !== 'number' || typeof meta.outputPrice !== 'number') {
    return null;
  }
  return { input: meta.inputPrice, output: meta.outputPrice, currency: 'USD' };
}
