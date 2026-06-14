import type { UsageMetadata } from '@anvika/shared/chat/message-metadata';

import { formatTwoToThreeDecimals } from './formatDecimals';

/**
 * Format a positive sub-cent cost to two significant figures, never in scientific notation.
 * Uses `toFixed` with enough decimal places to preserve the two most significant digits.
 *
 * @param cost - A positive number less than 0.01.
 * @returns A decimal string with no scientific notation, e.g. `"0.00000050"`.
 */
function formatSmallCost(cost: number): string {
  const exponent = Math.floor(Math.log10(cost));
  // toFixed throws RangeError for decimals > 100; clamp so a pathologically tiny cost cannot crash.
  const decimals = Math.min(100, Math.max(2, 1 - exponent));
  return cost.toFixed(decimals);
}

/** Display options for the cost readout: the target currency and the USD->INR rate. */
export interface CostDisplayOptions {
  /** The currency to render in. */
  currency: 'USD' | 'INR';
  /** Rupees per US dollar; applied only when `currency` is `'INR'`. */
  inrPerUsd: number;
}

/**
 * Format the estimated cost of a turn from its persisted token counts and price snapshot, or
 * `null` when either is absent (so the caller omits the cost line). Rates are USD per million tokens;
 * the USD estimate is `(input * inputRate + output * outputRate) / 1e6`. Small costs are formatted to
 * enough significant figures not to round to zero. The price snapshot is always stored in USD and is
 * historically accurate (no live price lookup); currency conversion happens only at render. When
 * `options.currency` is `'INR'`, the USD amount is multiplied by `options.inrPerUsd`. The currency is
 * emitted as a plain word (`USD` / `INR`), never a glyph, so screen readers announce it cleanly.
 *
 * The amount at or above 0.01 is shown to 2-3 decimals (a padded third zero is trimmed, so 12.5 reads
 * `12.50` and 1.712 reads `1.712`); sub-cent amounts keep enough significant figures not to round to
 * zero.
 *
 * @param usage - The message's usage metadata block.
 * @param options - Optional currency and USD->INR rate; defaults to rendering in USD.
 * @returns A display string like `estimated USD 0.018` or `estimated INR 1.712`, or `null` when
 *   unpriced or token-less.
 */
export function estimateCost(
  usage: UsageMetadata | undefined,
  options?: CostDisplayOptions,
): string | null {
  const price = usage?.price;
  const tokens = usage?.tokens;
  if (!price || !tokens || (tokens.input === undefined && tokens.output === undefined)) return null;
  const usd = ((tokens.input ?? 0) * price.input + (tokens.output ?? 0) * price.output) / 1_000_000;
  const currency = options?.currency ?? 'USD';
  // Convert before guarding so a zero/negative result in EITHER currency yields null (a zero rate
  // never renders a string of zeros). `&& options` narrows away the undefined case TS cannot infer
  // from `currency === 'INR'` alone, so no dead `?? 1` fallback and no non-null assertion are needed.
  const amount = currency === 'INR' && options ? usd * options.inrPerUsd : usd;
  if (amount <= 0) return null;
  const formatted = amount >= 0.01 ? formatTwoToThreeDecimals(amount) : formatSmallCost(amount);
  return `estimated ${currency} ${formatted}`;
}
