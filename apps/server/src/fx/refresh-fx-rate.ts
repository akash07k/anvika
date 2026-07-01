import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { loadSettings, patchSettings, type PatchResult } from '../settings/service';
import { fetchUsdToInrRate, type FxFetchDeps } from './fetch-fx-rate';
import { isFxRateStale } from './fx-staleness';

/** Injectable deps for a refresh: the FX fetch plus a clock. */
export type RefreshDeps = FxFetchDeps & { now?: () => number };

/** The outcome of a refresh attempt: the fetch failed, or a write was attempted (with its result). */
export type FxRefreshOutcome = { kind: 'fetch-failed' } | { kind: 'written'; patch: PatchResult };

/** Round a rate to 3 decimals. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Fetch a fresh USD-to-INR rate and write it into settings, rounded to 3 decimals, stamped with the
 * current time. Returns `fetch-failed` (and writes nothing) when the fetch fails, else `written` with
 * the {@link PatchResult} (which itself may be a `validation`/`file-invalid` failure - the caller maps
 * that to a canonical error). Does NOT pass `overwriteInvalid`: a broken settings file fails the write
 * like a normal save. The single place both the route and the startup hook call.
 *
 * @param store - The settings store.
 * @param owner - The settings owner.
 * @param deps - Injectable FX fetch and clock.
 * @returns The refresh outcome.
 */
export async function refreshFxRate(
  store: SettingsStore,
  owner: string,
  deps: RefreshDeps = {},
): Promise<FxRefreshOutcome> {
  const rate = await fetchUsdToInrRate(deps);
  if (rate === null) return { kind: 'fetch-failed' };
  const now = (deps.now ?? Date.now)();
  const patch = await patchSettings(store, owner, {
    inrPerUsd: round3(rate),
    inrPerUsdUpdatedAt: now,
  });
  return { kind: 'written', patch };
}

/**
 * Best-effort startup auto-refresh: when `autoRefreshFxRate` is on and the stored rate is stale,
 * refresh it; otherwise a no-op. Logs a content-safe outcome (never the URL/body). Never throws to the
 * caller - the startup path calls this fire-and-forget.
 *
 * @param store - The settings store.
 * @param deps - Injectable FX fetch and clock.
 */
export async function maybeRefreshFxRateOnStartup(
  store: SettingsStore,
  deps: RefreshDeps = {},
): Promise<void> {
  const { settings } = await loadSettings(store, OWNER_LOCAL);
  if (!settings.autoRefreshFxRate) return;
  const now = (deps.now ?? Date.now)();
  if (!isFxRateStale(settings.inrPerUsdUpdatedAt, now)) return;
  const outcome = await refreshFxRate(store, OWNER_LOCAL, deps);
  if (outcome.kind === 'written' && outcome.patch.ok) {
    serverLogger('fx').info('startup FX refresh updated the rate', {
      inrPerUsd: outcome.patch.settings.inrPerUsd,
    });
  } else {
    serverLogger('fx').warn('startup FX refresh did not update the rate', {
      reason: outcome.kind === 'fetch-failed' ? 'fetch-failed' : 'write-failed',
    });
  }
}
