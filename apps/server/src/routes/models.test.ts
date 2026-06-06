import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ModelsResponseSchema } from '@anvika/shared/models/contracts';
import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import type { AssembleDeps } from '../models/service';
import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { createModelsRoute } from './models';

function fakeStore(connections: unknown[]): SettingsStore {
  const data = SettingsSchema.parse({ connections });
  const row: StoredSettings = { data, version: CURRENT_SETTINGS_VERSION };
  return { load: vi.fn(async () => row), save: vi.fn(async () => undefined) };
}

function appWith(store: SettingsStore, assembleDeps?: AssembleDeps) {
  const app = new Hono();
  app.route(
    '/',
    createModelsRoute({ settingsStore: store, ...(assembleDeps ? { assembleDeps } : {}) }),
  );
  return app;
}

const fetchVeniceList = async () =>
  new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b' }] }), { status: 200 });

describe('GET /api/v1/models', () => {
  it('returns per-connection models tagged with connectionId/connectionLabel and a valid envelope', async () => {
    const store = fakeStore([
      {
        id: 'venice',
        label: 'Venice AI',
        type: 'openai-compatible',
        baseUrl: 'https://api.venice.ai/api/v1',
      },
    ]);
    const res = await appWith(store, { fetchImpl: fetchVeniceList }).request('/api/v1/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(ModelsResponseSchema.safeParse(body).success).toBe(true);
    const venice = body.models.find((m: { id: string }) => m.id === 'venice:llama-3.3-70b');
    expect(venice?.connectionId).toBe('venice');
    expect(venice?.connectionLabel).toBe('Venice AI');
    expect(venice?.providerId).toBe('openai-compatible');
  });

  it('returns an empty list when no connections are configured', async () => {
    const res = await appWith(fakeStore([])).request('/api/v1/models');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      models: [],
      connectionStatuses: [],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
  });

  it('GET /api/v1/models includes connectionStatuses', async () => {
    const store = fakeStore([
      {
        id: 'local',
        type: 'openai-compatible',
        label: 'Local',
        baseUrl: 'http://localhost:1234',
        enabled: true,
      },
    ]);
    const res = await appWith(store, {
      fetchImpl: () => Promise.reject(new Error('refused')),
    }).request('/api/v1/models');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.connectionStatuses).toEqual([{ connectionId: 'local', outcome: 'unreachable' }]);
  });
});

describe('POST /api/v1/models/refresh', () => {
  it('returns the fresh envelope', async () => {
    const res = await appWith(fakeStore([]), {
      fetchImpl: () => Promise.resolve(new Response('{}', { status: 200 })),
    }).request('/api/v1/models/refresh', { method: 'POST' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      models: [],
      connectionStatuses: [],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
  });
});
