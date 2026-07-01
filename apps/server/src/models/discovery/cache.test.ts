import { describe, expect, it } from 'vitest';

import { TtlCache } from './cache';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

/** Build a manually-controlled promise so tests release a coalesced load without real timers. */
function defer<T>(): Deferred<T> {
  const box: Partial<Pick<Deferred<T>, 'resolve' | 'reject'>> = {};
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  const { resolve, reject } = box;
  if (resolve === undefined || reject === undefined) {
    throw new Error('promise executor did not run synchronously');
  }
  return { promise, resolve, reject };
}

describe('TtlCache', () => {
  it('returns a cached value within the TTL and refetches after it expires', async () => {
    let calls = 0;
    const clock = { now: 0 };
    const cache = new TtlCache<string>(5 * 60 * 1000, () => clock.now);
    const load = async () => {
      calls += 1;
      return `v${calls}`;
    };
    expect(await cache.get('k', load)).toBe('v1');
    clock.now = 4 * 60 * 1000;
    expect(await cache.get('k', load)).toBe('v1'); // within TTL
    clock.now = 6 * 60 * 1000;
    expect(await cache.get('k', load)).toBe('v2'); // expired
    expect(calls).toBe(2);
  });

  it('reuses the last good value when a refetch loader throws', async () => {
    const clock = { now: 0 };
    const cache = new TtlCache<string>(1000, () => clock.now);
    expect(await cache.get('k', async () => 'good')).toBe('good');
    clock.now = 2000;
    expect(
      await cache.get('k', async () => {
        throw new Error('boom');
      }),
    ).toBe('good'); // fail-soft to last good
  });

  it('coalesces concurrent cold-cache loads into a single in-flight load', async () => {
    let calls = 0;
    const gate = defer<string>();
    const cache = new TtlCache<string>(1000, () => 0);
    const load = () => {
      calls += 1;
      return gate.promise;
    };
    const a = cache.get('k', load);
    const b = cache.get('k', load);
    const c = cache.get('k', load);
    gate.resolve('shared');
    expect(await Promise.all([a, b, c])).toEqual(['shared', 'shared', 'shared']);
    expect(calls).toBe(1);
  });

  it('clears the in-flight slot on rejection so a later call retries', async () => {
    const cache = new TtlCache<string>(1000, () => 0);
    await expect(
      cache.get('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom'); // no prior value: rethrow
    expect(await cache.get('k', async () => 'recovered')).toBe('recovered'); // slot cleared, retry ran
  });

  it('gives all concurrent coalesced awaiters the last good value when the load rejects', async () => {
    const clock = { now: 0 };
    const cache = new TtlCache<string>(1000, () => clock.now);
    expect(await cache.get('k', async () => 'good')).toBe('good');
    clock.now = 2000;
    const gate = defer<string>();
    const load = () => gate.promise;
    const a = cache.get('k', load);
    const b = cache.get('k', load);
    gate.reject(new Error('boom'));
    expect(await Promise.all([a, b])).toEqual(['good', 'good']); // fail-soft under coalescing
  });

  it('invalidate forces the next get to reload', async () => {
    let calls = 0;
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    const load = () => Promise.resolve(++calls);

    expect(await cache.get('k', load)).toBe(1); // miss -> load
    expect(await cache.get('k', load)).toBe(1); // fresh -> cached, no reload
    cache.invalidate('k');
    expect(await cache.get('k', load)).toBe(2); // invalidated -> reload
  });

  it('a stale in-flight load does not overwrite a value loaded after invalidate', async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    let resolveOld!: (v: number) => void;
    const oldLoad = () =>
      new Promise<number>((r) => {
        resolveOld = r;
      });

    const p1 = cache.get('k', oldLoad); // old load in flight (generation 0)
    cache.invalidate('k'); // bump generation to 1
    await cache.get('k', () => Promise.resolve(2)); // fresh load (generation 1) commits value 2

    resolveOld(1); // old load settles LATE with the stale value 1
    await p1; // let its .then run (it must NOT write, generation mismatch)

    // Within TTL the cached value must still be the fresh 2, never the stale 1.
    expect(await cache.get('k', () => Promise.resolve(99))).toBe(2);
  });
});
