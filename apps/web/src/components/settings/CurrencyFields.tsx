import { formatTwoToThreeDecimals } from '../../lib/format/formatDecimals';
import { NumberField } from '../fields/NumberField';
import { SelectField } from '../fields/SelectField';

/** Props for {@link CurrencyFields}. */
export interface CurrencyFieldsProps {
  /** The current display currency. */
  currency: 'USD' | 'INR';
  /** The current rupees-per-dollar rate. */
  inrPerUsd: number;
  /** Validation error for the currency control, if any. */
  currencyError?: string | undefined;
  /** Validation error for the rate control, if any. */
  rateError?: string | undefined;
  /** Commit a new currency selection. */
  onCurrencyChange: (currency: 'USD' | 'INR') => void;
  /** Commit a new rupees-per-dollar rate. */
  onRateCommit: (rate: number) => void;
}

/**
 * The two cost-display settings controls: a currency select (USD or INR) and the user-editable
 * INR-per-USD rate. Extracted from {@link SettingsForm} so that file stays under the line cap. The
 * cost estimate is stored in USD and converted at render; these controls only choose how it is shown.
 */
export function CurrencyFields({
  currency,
  inrPerUsd,
  currencyError,
  rateError,
  onCurrencyChange,
  onRateCommit,
}: CurrencyFieldsProps) {
  return (
    <>
      <SelectField
        id="currency"
        label="Currency"
        error={currencyError}
        value={currency}
        options={[
          { value: 'USD', label: 'US dollars (USD)' },
          { value: 'INR', label: 'Indian rupees (INR)' },
        ]}
        onChange={(v) => onCurrencyChange(v as 'USD' | 'INR')}
      />
      <NumberField
        id="inr-per-usd"
        label="INR per USD"
        description="Rupees per US dollar; converts the USD cost estimate to INR."
        error={rateError}
        value={inrPerUsd}
        onCommit={onRateCommit}
        format={formatTwoToThreeDecimals}
      />
    </>
  );
}
