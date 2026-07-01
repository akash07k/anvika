/** The staleness threshold for the auto-refresh: 3 days, in milliseconds. */
export const FX_STALE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Whether a stored rate is stale enough for the startup auto-refresh to replace it: `true` when it
 * was never set (`null`) or is strictly older than {@link FX_STALE_MS}. Pure and clock-injected by
 * the caller so it is deterministic in tests.
 *
 * @param updatedAt - The last-set epoch ms, or `null` when never set.
 * @param now - The current epoch ms.
 * @returns True when the rate is stale.
 */
export function isFxRateStale(updatedAt: number | null, now: number): boolean {
  return updatedAt === null || now - updatedAt > FX_STALE_MS;
}
