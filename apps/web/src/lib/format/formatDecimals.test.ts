import { describe, expect, it } from 'vitest';

import { formatTwoToThreeDecimals } from './formatDecimals';

describe('formatTwoToThreeDecimals', () => {
  it('keeps two decimals when the third is not meaningful', () => {
    expect(formatTwoToThreeDecimals(95.12)).toBe('95.12');
    expect(formatTwoToThreeDecimals(12.5)).toBe('12.50');
    expect(formatTwoToThreeDecimals(95.1)).toBe('95.10');
    expect(formatTwoToThreeDecimals(95)).toBe('95.00');
  });

  it('shows the third decimal when it carries information', () => {
    expect(formatTwoToThreeDecimals(95.123)).toBe('95.123');
    expect(formatTwoToThreeDecimals(1.712)).toBe('1.712');
    expect(formatTwoToThreeDecimals(0.018)).toBe('0.018');
  });

  it('rounds to at most three decimals', () => {
    expect(formatTwoToThreeDecimals(1.71198)).toBe('1.712');
  });
});
