/**
 * Format a non-negative amount to 2-3 decimal places: always at least 2 (the currency convention, and
 * a stable read for a screen reader) and a 3rd only when it carries real information, never a padded
 * trailing zero. For example `95.12` stays `"95.12"`, `95.123` stays `"95.123"`, `12.5` becomes
 * `"12.50"`, and `1.712` stays `"1.712"`. Values are assumed already rounded to at most 3 decimals
 * upstream (the FX refresh rounds the rate; the cost estimate is computed). Locale-free (no thousands
 * grouping) so the output is a plain, predictable number string.
 *
 * @param value - The amount to format (already rounded to at most 3 decimals).
 * @returns The amount with 2 or 3 decimal places, never a padded third zero.
 */
export function formatTwoToThreeDecimals(value: number): string {
  const fixed = value.toFixed(3);
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
}
