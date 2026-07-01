import { describe, expect, it } from 'vitest';

import type { UsageMetadata } from '@anvika/shared/chat/message-metadata';

import { estimateCost } from './estimateCost';

describe('estimateCost', () => {
  it('computes cost from tokens times per-million rates', () => {
    const usage: UsageMetadata = {
      tokens: { input: 1_000_000, output: 1_000_000 },
      price: { input: 2.5, output: 10, currency: 'USD' },
    };
    expect(estimateCost(usage)).toBe('estimated USD 12.50');
  });

  it('formats sub-cent costs without rounding to zero', () => {
    const usage: UsageMetadata = {
      tokens: { input: 1000, output: 0 },
      price: { input: 2.5, output: 10, currency: 'USD' },
    };
    // 1000 / 1e6 * 2.5 = 0.0025
    expect(estimateCost(usage)).toBe('estimated USD 0.0025');
  });

  it('returns null when there is no price snapshot', () => {
    expect(estimateCost({ tokens: { input: 10, output: 10 } })).toBeNull();
  });

  it('returns null when there are no token counts', () => {
    expect(estimateCost({ price: { input: 2.5, output: 10, currency: 'USD' } })).toBeNull();
  });

  it('formats a tiny sub-microdollar cost without scientific notation', () => {
    const usage: UsageMetadata = {
      tokens: { input: 10, output: 0 },
      price: { input: 0.05, output: 0, currency: 'USD' },
    };
    // 10 / 1e6 * 0.05 = 5e-7 -> must NOT be "5.0e-7"
    expect(estimateCost(usage)).toBe('estimated USD 0.00000050');
  });

  it('does not throw on a pathologically tiny cost (toFixed RangeError clamp)', () => {
    const usage: UsageMetadata = {
      tokens: { input: 1 },
      price: { input: 1e-200, output: 0, currency: 'USD' },
    };
    // Without the decimals clamp, toFixed would throw RangeError on a cost this small.
    expect(() => estimateCost(usage)).not.toThrow();
    expect(typeof estimateCost(usage)).toBe('string');
  });

  const priced: UsageMetadata = {
    tokens: { input: 1000, output: 1000 },
    price: { input: 3, output: 15, currency: 'USD' },
  };

  it('formats USD with a plain currency word (no glyph)', () => {
    expect(estimateCost(priced, { currency: 'USD', inrPerUsd: 95.11 })).toBe('estimated USD 0.018');
  });

  it('converts to INR using the rate and uses a plain currency word', () => {
    // 0.018 USD * 95.11 = 1.71198 INR -> '1.712'
    expect(estimateCost(priced, { currency: 'INR', inrPerUsd: 95.11 })).toBe('estimated INR 1.712');
  });

  it('defaults to USD when no options are given', () => {
    expect(estimateCost(priced)).toBe('estimated USD 0.018');
  });

  it('still returns null for an unpriced or token-less usage', () => {
    expect(
      estimateCost({ tokens: { input: 1000 } }, { currency: 'INR', inrPerUsd: 95.11 }),
    ).toBeNull();
  });

  it('returns null rather than a string of zeros when the INR rate is zero', () => {
    // Defensive: the rate is schema-bounded >0, but a 0 here must collapse to null, not "INR 0.00".
    expect(estimateCost(priced, { currency: 'INR', inrPerUsd: 0 })).toBeNull();
  });
});
