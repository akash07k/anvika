import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchJson, type FetchImpl } from './shared';

/** Throws unconditionally - simulates a network-level rejection. */
const rejectFetch: FetchImpl = async () => {
  throw new Error('network down');
};

/** Returns a 500 response - simulates a non-2xx server error. */
const serverErrorFetch: FetchImpl = async () => new Response('error', { status: 500 });

/** Returns a 200 response with valid JSON - simulates a successful fetch. */
const okFetch: FetchImpl = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });

describe('fetchJson', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null (does not throw) when fetchImpl rejects', async () => {
    const result = await fetchJson('https://example.com', {}, { fetchImpl: rejectFetch });
    expect(result).toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    const result = await fetchJson('https://example.com', {}, { fetchImpl: serverErrorFetch });
    expect(result).toBeNull();
  });

  it('clears its abort timer in the finally block after a successful fetch', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    await fetchJson('https://example.com', {}, { fetchImpl: okFetch });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('clears its abort timer in the finally block after a fetch error', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');

    await fetchJson('https://example.com', {}, { fetchImpl: rejectFetch });

    expect(clearSpy).toHaveBeenCalled();
  });
});
