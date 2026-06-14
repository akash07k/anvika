import { Hono } from 'hono';

import { makeApiError } from '@anvika/shared/errors';

import { refreshFxRate, type RefreshDeps } from '../fx/refresh-fx-rate';
import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { buildSettingsResponse } from '../settings/settings-response';

/** Options for {@link createFxRateRoute}. */
export interface CreateFxRateRouteInput {
  /** The injected settings store. */
  settingsStore: SettingsStore;
  /** Resolved on-disk paths, echoed in the settings envelope (no secret values). */
  paths: { settings: string; secrets: string };
  /** Injected FX fetch/clock for tests; defaults to the real fetch and clock. */
  fxDeps?: RefreshDeps;
}

/**
 * Build `POST /api/v1/settings/fx-rate/refresh`: fetch a fresh USD-to-INR rate and write it, returning
 * the redacted settings envelope (identical shape to GET/PATCH `/settings`) on success. A fetch failure
 * returns the canonical `fx-refresh-failed` (502); a write refusal/validation surfaces the propagated
 * canonical error (`settings-file-invalid` 409 or `validation-error` 400). Works regardless of the
 * auto-refresh toggle (it is an explicit user action). The fetched rate is validated, bound-checked,
 * and rounded to 3 decimals before any write. The route logs its own content-safe
 * outcome (a category plus the new rate on success, or a reason word on failure) - never the FX URL,
 * response body, or any header value.
 *
 * @param input - The settings store, on-disk paths, and optional injected FX deps.
 * @returns A Hono route exposing the refresh endpoint.
 */
export function createFxRateRoute(input: CreateFxRateRouteInput): Hono {
  return new Hono().post('/api/v1/settings/fx-rate/refresh', async (c) => {
    const outcome = await refreshFxRate(input.settingsStore, OWNER_LOCAL, input.fxDeps ?? {});
    if (outcome.kind === 'fetch-failed') {
      // Server-side outcome log: content-safe - a reason word, never the FX URL or body.
      serverLogger('fx').warn('on-demand FX refresh failed', { reason: 'fetch-failed' });
      return c.json(
        makeApiError('fx-refresh-failed', 'Could not fetch a fresh exchange rate'),
        502,
      );
    }
    const { patch } = outcome;
    if (!patch.ok) {
      serverLogger('fx').warn('on-demand FX refresh failed', { reason: 'write-failed' });
      if (patch.reason === 'file-invalid') {
        return c.json(
          makeApiError('settings-file-invalid', 'The settings file on disk is invalid.'),
          409,
        );
      }
      return c.json(makeApiError('validation-error', 'Invalid settings', patch.issues), 400);
    }
    serverLogger('fx').info('on-demand FX refresh updated the rate', {
      inrPerUsd: patch.settings.inrPerUsd,
    });
    // Redact then validate the envelope on the way OUT too (both-direction rule).
    return c.json(
      buildSettingsResponse({
        version: patch.version,
        settings: patch.settings,
        recovered: false,
        paths: input.paths,
      }),
    );
  });
}
