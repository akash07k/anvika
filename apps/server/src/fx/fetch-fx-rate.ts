import { z } from 'zod';

import { fetchJson, type DiscoveryOptions } from '../models/discovery/shared';

/** Injectable fetch/timeout for the FX request (reuses the discovery fetch shape). */
export type FxFetchDeps = DiscoveryOptions;

/** Frankfurter latest USD-to-INR endpoint (no API key). Verified against the source's docs. */
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR';

/** The slice of the Frankfurter response we depend on. */
const FxResponseSchema = z.object({ rates: z.object({ INR: z.number() }) });

/**
 * Fetch the current USD-to-INR rate from Frankfurter, or `null` on ANY failure (offline, timeout,
 * non-200, malformed body, or a rate outside the sane bound `> 0 and <= 100000`). Never throws and
 * never logs the URL or body. The caller maps `null` to the single content-safe failure outcome.
 *
 * @param deps - Injectable fetch/timeout (tests supply a fake `fetchImpl`); defaults to global fetch.
 * @returns The INR rate, or `null` on any failure.
 */
export async function fetchUsdToInrRate(deps: FxFetchDeps = {}): Promise<number | null> {
  const json = await fetchJson(FRANKFURTER_URL, { headers: { accept: 'application/json' } }, deps);
  const parsed = FxResponseSchema.safeParse(json);
  if (!parsed.success) return null;
  const rate = parsed.data.rates.INR;
  return rate > 0 && rate <= 100000 ? rate : null;
}
