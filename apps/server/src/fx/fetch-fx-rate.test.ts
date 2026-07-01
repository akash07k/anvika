import { describe, expect, it } from 'vitest';

import { fetchUsdToInrRate } from './fetch-fx-rate';

/** A fake fetch returning the given status and JSON body. */
function fakeFetch(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), { status });
}

describe('fetchUsdToInrRate', () => {
  it('returns the INR rate from a well-formed response', async () => {
    const rate = await fetchUsdToInrRate({
      fetchImpl: fakeFetch(200, { rates: { INR: 83.2456 } }),
    });
    expect(rate).toBe(83.2456);
  });

  it('returns null on a non-200 response', async () => {
    expect(await fetchUsdToInrRate({ fetchImpl: fakeFetch(503, {}) })).toBeNull();
  });

  it('returns null on a malformed body', async () => {
    expect(await fetchUsdToInrRate({ fetchImpl: fakeFetch(200, { nope: true }) })).toBeNull();
  });

  it('returns null when the fetch throws (offline)', async () => {
    const rate = await fetchUsdToInrRate({
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(rate).toBeNull();
  });

  it('returns null for an out-of-range rate', async () => {
    expect(
      await fetchUsdToInrRate({ fetchImpl: fakeFetch(200, { rates: { INR: 0 } }) }),
    ).toBeNull();
    expect(
      await fetchUsdToInrRate({ fetchImpl: fakeFetch(200, { rates: { INR: 100001 } }) }),
    ).toBeNull();
  });
});
