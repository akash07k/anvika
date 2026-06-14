import { useQuery } from '@tanstack/react-query';

import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';
import { ModelsResponseSchema } from '@anvika/shared/models/contracts';
import type { ModelInfo } from '@anvika/shared/models/model-info';

import { apiGet } from '../../lib/api-client';

/** TanStack Query key for the available model list. */
export const modelsQueryKey = ['models'] as const;

/**
 * Fetch and validate the full models envelope from `GET /api/v1/models`. Both selector hooks select
 * from this cached result so the network call is issued only once per stale interval.
 */
async function fetchModelsEnvelope() {
  return apiGet('/api/v1/models', ModelsResponseSchema);
}

/** Inferred type of the validated envelope. */
type ModelsEnvelope = Awaited<ReturnType<typeof fetchModelsEnvelope>>;

// Stable, module-level select references. TanStack Query re-runs `select` only when its reference or
// the cached data changes. Hoisting these avoids re-deriving the
// selection on every render and prevents spurious subscriber re-renders.
const selectModels = (envelope: ModelsEnvelope): ModelInfo[] => envelope.models;
const selectStatuses = (envelope: ModelsEnvelope): ConnectionDiscoveryStatus[] =>
  envelope.connectionStatuses;

/**
 * Load the available models from `GET /api/v1/models`. The query caches the full
 * validated envelope; this hook selects the flat `ModelInfo[]` (return type unchanged for existing
 * consumers). The endpoint returns only the configured providers' models, ids namespaced
 * `connectionId:model`; `ModelsResponseSchema` validates the envelope at this trust boundary.
 * An empty list (no provider configured) is a successful result, not an error - the picker renders
 * its empty state.
 *
 * @returns The TanStack Query result whose `data` is the available `ModelInfo[]`.
 */
export function useModels() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: fetchModelsEnvelope,
    // The available list only changes when provider credentials or the local base URL change, which the
    // settings store invalidates explicitly. A 5-minute staleTime suppresses the
    // redundant refocus/remount refetches that would otherwise re-hit OpenRouter's /models each time;
    // the explicit invalidation still forces an immediate refetch on a config change.
    staleTime: 5 * 60_000,
    select: selectModels,
  });
}

/**
 * The per-connection discovery statuses, selected from the SAME cached models envelope
 * as {@link useModels} (one shared `['models']` key, one fetch). `data` is the status array, or
 * `undefined` before the first load.
 *
 * @returns The TanStack Query result whose `data` is the `ConnectionDiscoveryStatus[]`.
 */
export function useConnectionStatuses() {
  return useQuery({
    queryKey: modelsQueryKey,
    queryFn: fetchModelsEnvelope,
    staleTime: 5 * 60_000,
    select: selectStatuses,
  });
}
