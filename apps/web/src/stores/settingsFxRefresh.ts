import { SettingsResponseSchema } from '@anvika/shared/settings/contracts';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { apiPost } from '../lib/api-client';
import { notify } from '../notifications/notifier';

/** The minimal store setter {@link refreshFxRate} needs: write the reconciled `version`/`settings`. */
export type FxRefreshSetter = (partial: { version?: number; settings?: RedactedSettings }) => void;

/**
 * Refresh the stored USD-to-INR exchange rate on user request via
 * `POST /api/v1/settings/fx-rate/refresh`. It announces the lifecycle only: `fxRefreshStarted`
 * up front, then `fxRefreshOk` with the new rate after reconciling the authoritative settings, or the
 * uniform `fxRefreshFailed` on any error. The failure is logged SERVER-side in the route, so this
 * action emits NO client diagnostic; it announces and nothing more.
 *
 * @param set - The settings store setter used to reconcile `version`/`settings` from the response.
 */
export async function refreshFxRate(set: FxRefreshSetter): Promise<void> {
  notify({ type: 'fxRefreshStarted' });
  try {
    const body = await apiPost('/api/v1/settings/fx-rate/refresh', {}, SettingsResponseSchema);
    if (!body) {
      // The route always returns a body on success; a no-body response is unexpected, so announce the
      // uniform failure rather than leaving the started announcement unresolved (no silent dead-end).
      notify({ type: 'fxRefreshFailed' });
      return;
    }
    set({ version: body.version, settings: body.settings });
    notify({ type: 'fxRefreshOk', rate: body.settings.inrPerUsd });
  } catch {
    // The failure is logged server-side in the route; the user gets the uniform announcement.
    notify({ type: 'fxRefreshFailed' });
  }
}
