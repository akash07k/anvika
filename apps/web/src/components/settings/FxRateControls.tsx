import { useState } from 'react';

import { useSettingsStore } from '../../stores/settingsStore';
import { ToggleField } from '../fields/ToggleField';
import { RemoteRefreshButton } from './RemoteRefreshButton';

/** Props for {@link FxRateControls}. */
export interface FxRateControlsProps {
  /** Whether the startup auto-refresh is enabled. */
  autoRefreshFxRate: boolean;
  /** Epoch ms the rate was last set, or null when never. */
  inrPerUsdUpdatedAt: number | null;
  /** Commit a new auto-refresh toggle value. */
  onAutoRefreshChange: (on: boolean) => void;
}

/**
 * Render the last-updated date, or "never".
 *
 * @param updatedAt - Epoch ms the rate was last set, or null when never.
 * @returns A plain, screen-reader-friendly last-updated line.
 */
function lastUpdatedText(updatedAt: number | null): string {
  return updatedAt === null
    ? 'Exchange rate last updated: never'
    : `Exchange rate last updated: ${new Date(updatedAt).toLocaleDateString()}`;
}

/**
 * The FX-rate controls in the "Cost display" settings section: an on-demand "Update exchange rate now"
 * button (works regardless of the toggle), an "Automatically refresh the exchange rate" toggle, and a
 * read-only last-updated line. The button calls the store's `refreshFxRate`, which owns the request
 * and the screen-reader announcements; the busy state disables the button while a refresh is in flight.
 *
 * @param props - See {@link FxRateControlsProps}.
 * @returns The FX-rate controls.
 */
export function FxRateControls({
  autoRefreshFxRate,
  inrPerUsdUpdatedAt,
  onAutoRefreshChange,
}: FxRateControlsProps) {
  const refreshFxRate = useSettingsStore((s) => s.refreshFxRate);
  const [busy, setBusy] = useState(false);
  const onPress = () => {
    setBusy(true);
    void refreshFxRate().finally(() => setBusy(false));
  };
  return (
    <>
      <RemoteRefreshButton
        label="Update exchange rate now"
        busy={busy}
        onPress={onPress}
        describedBy="fx-last-updated"
      />
      <ToggleField
        id="auto-refresh-fx"
        label="Automatically refresh the exchange rate"
        checked={autoRefreshFxRate}
        onChange={onAutoRefreshChange}
      />
      <p id="fx-last-updated">{lastUpdatedText(inrPerUsdUpdatedAt)}</p>
    </>
  );
}
