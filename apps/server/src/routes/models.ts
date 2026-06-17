import { Hono } from 'hono';

import { ModelsResponseSchema } from '@anvika/shared/models/contracts';

import { bustModelsDevCache } from '../models/enrichment/modelsdev';
import { assembleModelsAndStatuses, type AssembleDeps } from '../models/service';
import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { loadSettings } from '../settings/service';

/** Options for {@link createModelsRoute}. */
export interface CreateModelsRouteInput {
  /** The injected settings store (Drizzle in production, a fake in tests). */
  settingsStore: SettingsStore;
  /** Optional injected discovery/enrichment deps (tests supply a fake fetch); defaults to global fetch. */
  assembleDeps?: AssembleDeps;
}

/**
 * Build the `GET /api/v1/models` and `POST /api/v1/models/refresh` routes.
 *
 * `GET /api/v1/models`: load the owner's settings, assemble the per-connection available-model list
 * (live membership discovery unioned with each connection's manual model ids, enriched with
 * price/context), and return the full envelope including `connectionStatuses`. Each model
 * carries its `connectionId`/`connectionLabel` and its connection type as `providerId`.
 * Side-effect-free: reads settings but persists nothing and does not bust any cache.
 *
 * `POST /api/v1/models/refresh`: bust the models.dev catalog cache so the next assembly
 * carries current pricing/limits immediately, then re-assemble and return the same envelope shape
 * as GET. The catalog is public and keyless; a failed re-pull reuses the last good catalog
 * (fail-soft). Only this POST calls `bustModelsDevCache`; GET stays side-effect-free.
 *
 * @param input - The injected settings store and optional assembly deps.
 * @returns A Hono router exposing `GET /api/v1/models` and `POST /api/v1/models/refresh`.
 */
export function createModelsRoute(input: CreateModelsRouteInput): Hono {
  return new Hono()
    .get('/api/v1/models', async (c) => {
      const { settings } = await loadSettings(input.settingsStore, OWNER_LOCAL);
      const result = await assembleModelsAndStatuses(settings, input.assembleDeps);
      return c.json(ModelsResponseSchema.parse(result));
    })
    .post('/api/v1/models/refresh', async (c) => {
      bustModelsDevCache();
      const { settings } = await loadSettings(input.settingsStore, OWNER_LOCAL);
      const result = await assembleModelsAndStatuses(settings, input.assembleDeps);
      serverLogger('models').info('manual models refresh completed', {
        modelCount: result.models.length,
        connectionCount: result.connectionStatuses.length,
      });
      return c.json(ModelsResponseSchema.parse(result));
    });
}
