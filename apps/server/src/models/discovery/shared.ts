import type { ModelMeta } from '../enrichment/meta';

/** Default timeout for a discovery fetch, in milliseconds. */
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * One element of a discovery result: a bare model id plus OPTIONAL live metadata. Most adapters
 * return just `{ id }`; OpenRouter and xAI may attach `meta` when their listing carried inline
 * pricing/context, which the caller threads into {@link enrich} as the highest-priority override.
 */
export interface DiscoveredModel {
  /** The bare model id (provider-native; no `connectionId:` prefix). */
  id: string;
  /** Live metadata from the provider's own listing, when present. */
  meta?: ModelMeta;
}

/**
 * The minimal fetch signature discovery depends on: `(url, init) => Promise<Response>`. Narrower than
 * the global `fetch` type (which also carries `preconnect`), so a plain test mock satisfies it.
 */
export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

/** Injectable options for discovery (tests supply a fake `fetchImpl`; default uses global `fetch`). */
export interface DiscoveryOptions {
  /** The fetch implementation; defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
  /** The abort timeout in milliseconds; defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Fetch JSON with an abort timeout; returns `null` on any error or non-200 (never throws). */
export async function fetchJson(
  url: string,
  init: RequestInit,
  opts: DiscoveryOptions,
): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
