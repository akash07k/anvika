import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { CurrencyFields } from './CurrencyFields';
import { FxRateControls } from './FxRateControls';

/** Props for {@link CostDisplaySection}. */
export interface CostDisplaySectionProps {
  /** The redacted settings the section reads its currency and FX fields from. */
  settings: RedactedSettings;
  /** Per-field validation errors keyed by field id, from the last rejected PATCH. */
  fieldErrors: Record<string, string>;
  /** Commit a single currency field change (the form's `setField`, bound to its `onPatch`). */
  onCurrencyChange: (value: RedactedSettings['currency']) => void;
  /** Commit a new INR-per-USD rate. */
  onRateCommit: (value: number) => void;
  /** Commit the auto-refresh toggle value. */
  onAutoRefreshChange: (on: boolean) => void;
}

/**
 * The "Cost display" settings section: the currency select and INR-per-USD rate field, plus the
 * FX-rate controls (on-demand refresh button, auto-refresh toggle, and last-updated line). Extracted
 * from {@link SettingsForm} so that form stays under the per-file line cap (ADR 0007).
 *
 * @param props - See {@link CostDisplaySectionProps}.
 * @returns The Cost display section.
 */
export function CostDisplaySection({
  settings,
  fieldErrors,
  onCurrencyChange,
  onRateCommit,
  onAutoRefreshChange,
}: CostDisplaySectionProps) {
  return (
    <>
      <h3>Cost display</h3>
      <CurrencyFields
        currency={settings.currency}
        inrPerUsd={settings.inrPerUsd}
        currencyError={fieldErrors['currency']}
        rateError={fieldErrors['inr-per-usd']}
        onCurrencyChange={onCurrencyChange}
        onRateCommit={onRateCommit}
      />
      <FxRateControls
        autoRefreshFxRate={settings.autoRefreshFxRate}
        inrPerUsdUpdatedAt={settings.inrPerUsdUpdatedAt}
        onAutoRefreshChange={onAutoRefreshChange}
      />
    </>
  );
}
