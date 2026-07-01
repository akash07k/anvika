import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import { createFxRateRoute } from './fx-rate';
import type { SettingsStore } from '../persistence/ports';

// Seeds the store at the current settings version (the only valid version at the v1 baseline); the
// response envelope echoes it back, so `body.version` asserts the wire contract carries the version.
function storeWith(data: Record<string, unknown>): SettingsStore {
  return {
    load: vi.fn(async () => ({ version: CURRENT_SETTINGS_VERSION, data })),
    save: vi.fn(async () => undefined),
  } as unknown as SettingsStore;
}
const paths = { settings: '/s', secrets: '/x' };
const okFetch = (inr: number) => async () =>
  new Response(JSON.stringify({ rates: { INR: inr } }), { status: 200 });

describe('POST /api/v1/settings/fx-rate/refresh', () => {
  it('returns the redacted settings envelope with the new rate on success', async () => {
    const app = createFxRateRoute({
      settingsStore: storeWith(SettingsSchema.parse({})),
      paths,
      fxDeps: { fetchImpl: okFetch(84.5), now: () => 1 },
    });
    const res = await app.request('/api/v1/settings/fx-rate/refresh', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.inrPerUsd).toBe(84.5);
    expect(body.version).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('returns fx-refresh-failed (502) when the fetch fails', async () => {
    const app = createFxRateRoute({
      settingsStore: storeWith(SettingsSchema.parse({})),
      paths,
      fxDeps: { fetchImpl: async () => new Response('{}', { status: 503 }) },
    });
    const res = await app.request('/api/v1/settings/fx-rate/refresh', { method: 'POST' });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('fx-refresh-failed');
  });

  it('returns settings-file-invalid (409) when the on-disk settings cannot be read', async () => {
    // A corrupt row makes loadSettings recover to defaults; without overwriteInvalid the write is
    // refused as file-invalid, which the route maps to a 409. The fetch itself succeeds.
    const app = createFxRateRoute({
      settingsStore: storeWith({ connections: 'not-an-array' }),
      paths,
      fxDeps: { fetchImpl: okFetch(84.5), now: () => 1 },
    });
    const res = await app.request('/api/v1/settings/fx-rate/refresh', { method: 'POST' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('settings-file-invalid');
  });
});
