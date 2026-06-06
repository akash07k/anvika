import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';
import { ModelInfoSchema, type ModelInfo } from '@anvika/shared/models/model-info';
import type { Connection } from '@anvika/shared/settings/connection';
import type { Settings } from '@anvika/shared/settings/schema';

import { discoverModels } from './discovery/dispatch';
import { resolveDiscoveryOutcome } from './discovery/outcome';
import type { DiscoveredModel, DiscoveryOptions } from './discovery/shared';
import { enrich } from './enrichment/enrich';
import { reasoningCapabilityFor } from './reasoning-capability';

/** Injectable dependencies for assembly (tests supply a fake `fetchImpl`). */
export type AssembleDeps = DiscoveryOptions;

/**
 * Union discovered models (which may carry live meta) with manual ids (no meta), de-duplicated by
 * bare id keeping the FIRST occurrence's meta (discovered before manual), preserving order.
 */
function unionModels(
  discovered: DiscoveredModel[],
  manualIds: readonly string[],
): DiscoveredModel[] {
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const model of [...discovered, ...manualIds.map((id) => ({ id }))]) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out;
}

/**
 * Build the `ModelInfo` records for one connection from a pre-discovered list (never calls
 * `discoverModels`). Unions with the connection's manual ids, enriches each in parallel, and
 * tags every record with the connection identity. Enrichment is fail-soft (never throws).
 *
 * @param connection - The connection to build models for.
 * @param discovered - The live-discovered models for this connection (pre-discovery, pre-union).
 * @param deps - Injectable fetch/timeout for enrichment (tests supply a fake).
 * @returns The enriched, connection-tagged model records.
 */
async function buildModels(
  connection: Connection,
  discovered: DiscoveredModel[],
  deps: AssembleDeps,
): Promise<ModelInfo[]> {
  const models = unionModels(discovered, connection.manualModelIds ?? []);
  // Enrich every model in parallel: on a cold models.dev cache a sequential loop would block each
  // model behind the previous fetch. `enrich` is fail-soft (never throws), so `Promise.all` is
  // safe; the result is mapped back in `models` order, preserving the prior stable output order.
  // A model's live meta (when present) is passed as the highest-priority override;
  // `exactOptionalPropertyTypes` is on, so `override` is spread only when defined.
  const metas = await Promise.all(
    models.map((m) => enrich(connection.type, m.id, m.meta ? { ...deps, override: m.meta } : deps)),
  );
  return models.map((m, i) => {
    const meta = metas[i] as Awaited<ReturnType<typeof enrich>>;
    return {
      id: `${connection.id}:${m.id}`,
      providerId: connection.type,
      connectionId: connection.id,
      connectionLabel: connection.label,
      displayName: m.id,
      contextWindow: meta.contextWindow,
      maxOutputTokens: meta.maxOutputTokens,
      inputPrice: meta.inputPrice,
      outputPrice: meta.outputPrice,
      capabilities: {
        text: true,
        reasoning: reasoningCapabilityFor(connection.type, m.id).supported,
      },
    };
  });
}

/**
 * Run live discovery for one connection ONCE, then derive both the model list and the discovery
 * status in parallel from the same discovered set.
 *
 * @param connection - The enabled connection to process.
 * @param deps - Injectable fetch/timeout for discovery, enrichment, and outcome probing.
 * @returns The built models and the content-safe discovery status for this connection.
 */
async function modelsAndStatusForConnection(
  connection: Connection,
  deps: AssembleDeps,
): Promise<{ models: ModelInfo[]; status: ConnectionDiscoveryStatus }> {
  const discovered = await discoverModels(connection, deps);
  const [models, outcome] = await Promise.all([
    buildModels(connection, discovered, deps),
    resolveDiscoveryOutcome(connection, discovered, deps),
  ]);
  return { models, status: { connectionId: connection.id, outcome } };
}

/**
 * Assemble the available models AND each enabled connection's discovery status.
 * Disabled connections are skipped entirely - they contribute no models and no status entry.
 * Discovery and enrichment are fail-soft, so this never throws; every `ModelInfo` record is
 * re-validated against {@link ModelInfoSchema} and dropped if malformed.
 *
 * @param settings - The validated settings.
 * @param deps - Injectable discovery/enrichment fetch for tests.
 * @returns The available models and the per-connection statuses for enabled connections.
 */
export async function assembleModelsAndStatuses(
  settings: Settings,
  deps: AssembleDeps = {},
): Promise<{ models: ModelInfo[]; connectionStatuses: ConnectionDiscoveryStatus[] }> {
  const enabled = settings.connections.filter((c) => c.enabled);
  const results = await Promise.all(enabled.map((c) => modelsAndStatusForConnection(c, deps)));
  const models = results
    .flatMap((r) => r.models)
    .filter((m) => ModelInfoSchema.safeParse(m).success);
  const connectionStatuses = results.map((r) => r.status);
  return { models, connectionStatuses };
}

/**
 * Assemble the available models across all enabled connections: per connection,
 * live membership discovery unioned with manual model ids, each enriched with price/context,
 * tagged with `connectionId`/`connectionLabel` and the connection type as `providerId`. Disabled
 * connections are skipped. Discovery and enrichment are fail-soft, so the endpoint never throws;
 * every record is re-validated against {@link ModelInfoSchema} and dropped if malformed.
 *
 * Delegates to {@link assembleModelsAndStatuses} and returns only the models.
 *
 * @param settings - The validated settings.
 * @param deps - Injectable discovery/enrichment fetch for tests.
 * @returns The available models, contract-shaped and contract-valid.
 */
export async function assembleAvailableModels(
  settings: Settings,
  deps: AssembleDeps = {},
): Promise<ModelInfo[]> {
  return (await assembleModelsAndStatuses(settings, deps)).models;
}
