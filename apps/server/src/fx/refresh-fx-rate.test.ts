import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import type { SettingsStore } from '../persistence/ports';
import { maybeRefreshFxRateOnStartup, refreshFxRate } from './refresh-fx-rate';

/** A settings store seeded with `data` at the current version; records saves. */
function storeWith(data: Record<string, unknown>): SettingsStore & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    load: vi.fn(async () => ({ version: CURRENT_SETTINGS_VERSION, data })),
    save: vi.fn(async (_o: string, s: unknown) => void saved.push(s)),
    saved,
  } as unknown as SettingsStore & { saved: unknown[] };
}
const okFetch = (inr: number) => async () =>
  new Response(JSON.stringify({ rates: { INR: inr } }), { status: 200 });
const failFetch = async () => new Response('{}', { status: 503 });

describe('refreshFxRate', () => {
  it('rounds the fetched rate to 3 decimals and writes it with a timestamp', async () => {
    const store = storeWith(SettingsSchema.parse({}));
    const outcome = await refreshFxRate(store, 'local', {
      fetchImpl: okFetch(83.24567),
      now: () => 1_700_000_000_000,
    });
    expect(outcome.kind).toBe('written');
    if (outcome.kind === 'written' && outcome.patch.ok) {
      expect(outcome.patch.settings.inrPerUsd).toBe(83.246);
      expect(outcome.patch.settings.inrPerUsdUpdatedAt).toBe(1_700_000_000_000);
    }
  });

  it('returns fetch-failed and writes nothing when the fetch fails', async () => {
    const store = storeWith(SettingsSchema.parse({}));
    const outcome = await refreshFxRate(store, 'local', { fetchImpl: failFetch });
    expect(outcome.kind).toBe('fetch-failed');
    expect(store.saved).toHaveLength(0);
  });
});

describe('maybeRefreshFxRateOnStartup', () => {
  it('refreshes when the toggle is on and the rate is stale', async () => {
    const store = storeWith(
      SettingsSchema.parse({ autoRefreshFxRate: true, inrPerUsdUpdatedAt: null }),
    );
    await maybeRefreshFxRateOnStartup(store, {
      fetchImpl: okFetch(84),
      now: () => 1_700_000_000_000,
    });
    expect(store.saved).toHaveLength(1);
  });

  it('does nothing when the toggle is off', async () => {
    const store = storeWith(SettingsSchema.parse({ autoRefreshFxRate: false }));
    await maybeRefreshFxRateOnStartup(store, { fetchImpl: okFetch(84) });
    expect(store.saved).toHaveLength(0);
  });

  it('does nothing when the rate is fresh', async () => {
    const now = 1_700_000_000_000;
    const store = storeWith(
      SettingsSchema.parse({ autoRefreshFxRate: true, inrPerUsdUpdatedAt: now - 1000 }),
    );
    await maybeRefreshFxRateOnStartup(store, { fetchImpl: okFetch(84), now: () => now });
    expect(store.saved).toHaveLength(0);
  });
});
