import type { Connection } from '@anvika/shared/settings/connection';

import { discoverAnthropicModelIds } from './anthropic';
import { discoverGoogleModelIds } from './google';
import { discoverOpenAiModelIds } from './openai';
import { discoverOpenAiCompatibleModelIds } from './openai-compatible';
import { discoverOpenRouterModels } from './openrouter';
import type { DiscoveredModel, DiscoveryOptions } from './shared';
import { discoverXaiModels } from './xai';

/** Wrap an id-only adapter's result as {@link DiscoveredModel}s (no live meta). */
function asDiscovered(ids: Promise<string[]>): Promise<DiscoveredModel[]> {
  return ids.then((list) => list.map((id) => ({ id })));
}

/**
 * Discover a connection's available models via its type's live adapter, as {@link DiscoveredModel}s: a
 * bare model id plus OPTIONAL live metadata (OpenRouter carries inline pricing/context; the id-only
 * adapters yield `{ id }`). Azure has no data-plane listing, so membership comes solely from its manual
 * model ids (this returns `[]`). Every adapter is fail-soft (`[]` on any error). The caller unions the
 * result with `connection.manualModelIds`, enriches (threading any live meta as the highest-priority
 * override), and caches.
 *
 * @param connection - The connection to discover models for.
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered models, or `[]`.
 */
export function discoverModels(
  connection: Connection,
  opts: DiscoveryOptions = {},
): Promise<DiscoveredModel[]> {
  const type = connection.type;
  if (type === 'google') return asDiscovered(discoverGoogleModelIds(connection, opts));
  if (type === 'anthropic') return asDiscovered(discoverAnthropicModelIds(connection, opts));
  if (type === 'xai') return discoverXaiModels(connection, opts);
  if (type === 'openrouter') return discoverOpenRouterModels(connection, opts);
  if (type === 'openai') return asDiscovered(discoverOpenAiModelIds(connection, opts));
  if (type === 'openai-compatible') {
    return asDiscovered(discoverOpenAiCompatibleModelIds(connection, opts));
  }
  return Promise.resolve([]);
}
