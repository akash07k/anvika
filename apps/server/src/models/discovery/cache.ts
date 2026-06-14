/** A monotonic millisecond clock; injectable so tests need no real time. */
export type Clock = () => number;

interface Entry<T> {
  value: T;
  storedAt: number;
}

/**
 * A tiny in-process cache with a fixed TTL and fail-soft reuse: within the TTL the cached value is
 * returned; after it expires the loader runs, and if the loader throws the last good value is reused
 * (so a transient discovery failure never empties the list). Keyed by string. No eviction beyond TTL
 * staleness - the key space (connection ids, provider+model) is small.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, Entry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private readonly generation = new Map<string, number>();

  /**
   * @param ttlMs - Entry lifetime in milliseconds.
   * @param now - Injectable clock (defaults to `Date.now`).
   */
  constructor(
    private readonly ttlMs: number,
    private readonly now: Clock = () => Date.now(),
  ) {}

  /**
   * Get the cached value for `key`, or run `load` to populate it. Returns the cached value within the
   * TTL; on expiry runs `load`, falling back to the last good value if `load` throws. Throws only when
   * there is no prior value AND `load` throws. Concurrent misses for the same key share a single
   * in-flight `load` (single-flight) instead of each firing their own, preventing a stampede.
   *
   * @param key - The cache key.
   * @param load - The async loader run on miss/expiry.
   * @returns The cached or freshly loaded value.
   */
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.store.get(key);
    const fresh = existing !== undefined && this.now() - existing.storedAt < this.ttlMs;
    if (fresh) return existing.value;
    const pending = this.inFlight.get(key) ?? this.startLoad(key, load);
    try {
      return await pending;
    } catch (error) {
      if (existing !== undefined) return existing.value;
      throw error;
    }
  }

  /**
   * Drop the cached value and any in-flight load for `key`, so the next {@link get} reloads. Used by
   * the manual models refresh to force a fresh models.dev catalog pull. Also bumps the
   * generation counter so any load already in flight for this key will NOT write its (now stale) value
   * back once it settles - a fetch that was superseded by a bust must never overwrite the fresh value.
   *
   * @param key - The cache key to invalidate.
   */
  invalidate(key: string): void {
    this.store.delete(key);
    this.inFlight.delete(key);
    this.generation.set(key, (this.generation.get(key) ?? 0) + 1);
  }

  /**
   * Start a single shared `load` for `key`: record its Promise so concurrent misses await it, write
   * the value on success only if the generation has not advanced (i.e. no invalidate() happened while
   * the load was in flight), and always clear the in-flight slot so a rejection never poisons the key.
   */
  private startLoad(key: string, load: () => Promise<T>): Promise<T> {
    const generation = this.generation.get(key) ?? 0;
    const pending = load().then((value) => {
      // Only commit if this load has not been superseded by an invalidate() since it started, so a
      // stale in-flight load that settles after a bust never overwrites the fresh value.
      if ((this.generation.get(key) ?? 0) === generation) {
        this.store.set(key, { value, storedAt: this.now() });
      }
      return value;
    });
    this.inFlight.set(key, pending);
    // Clear the slot on settle without creating an unhandled-rejection: swallow on the cleanup
    // branch only - every real caller still awaits `pending` itself and sees the rejection there.
    void pending
      .catch(() => undefined)
      .finally(() => {
        if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
      });
    return pending;
  }
}
