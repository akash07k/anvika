import { describe, expect, it } from 'vitest';

import { FX_STALE_MS, isFxRateStale } from './fx-staleness';

describe('isFxRateStale', () => {
  it('is stale when never set (null)', () => {
    expect(isFxRateStale(null, 1_000_000)).toBe(true);
  });

  it('is fresh just under the threshold and stale just over it', () => {
    const now = 1_000_000_000_000;
    expect(isFxRateStale(now - (FX_STALE_MS - 1), now)).toBe(false);
    expect(isFxRateStale(now - (FX_STALE_MS + 1), now)).toBe(true);
  });

  it('is fresh exactly at the threshold (not strictly older)', () => {
    const now = 1_000_000_000_000;
    expect(isFxRateStale(now - FX_STALE_MS, now)).toBe(false);
  });
});
