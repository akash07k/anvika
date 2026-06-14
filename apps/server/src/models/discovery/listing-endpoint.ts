import type { Connection } from '@anvika/shared/settings/connection';

/** The Anthropic API version header, pinned to the value the installed `@ai-sdk/anthropic` sends. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** The Azure data-plane Models List api-version used for a minimal authorized probe. */
export const AZURE_MODELS_API_VERSION = '2024-10-21';

/**
 * The HTTP request for a connection's model-listing endpoint: the fully-built URL and request headers.
 * The URL may embed Google's `?key=` and the headers may carry the secret key, so neither is ever logged.
 */
export interface ListingRequest {
  /** The fully-built listing URL (may embed Google's `?key=`; never logged). */
  url: string;
  /** The request headers (may carry the secret key; never logged). */
  headers: Record<string, string>;
}

/**
 * Build the model-listing request (URL + headers) for a connection, the single source of truth for each
 * type's listing endpoint (docs/research/model-discovery.md). The discovery adapters call this with a
 * present key (after their keyless guard); the test-connection probe calls it with `apiKey` possibly
 * empty so an unauthorized probe can still read the 401/403 status. The returned URL/headers may contain
 * the secret (Google embeds the key in the query string; others use auth headers) and so must never be
 * logged.
 *
 * @param connection - The connection to build a listing request for.
 * @param apiKey - The API key to embed (callers pass `connection.apiKey ?? ''` when an empty key is allowed).
 * @returns The {@link ListingRequest}.
 */
export function listingRequest(connection: Connection, apiKey: string): ListingRequest {
  const type = connection.type;
  if (type === 'anthropic')
    return {
      url: `${connection.baseUrl ?? 'https://api.anthropic.com'}/v1/models`,
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    };
  if (type === 'openai')
    return {
      url: `${connection.baseUrl ?? 'https://api.openai.com'}/v1/models`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  if (type === 'google')
    return {
      url: `${connection.baseUrl ?? 'https://generativelanguage.googleapis.com'}/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      headers: {},
    };
  if (type === 'openrouter')
    return {
      url: 'https://openrouter.ai/api/v1/models',
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  if (type === 'xai')
    return {
      url: `${connection.baseUrl ?? 'https://api.x.ai'}/v1/language-models`,
      headers: { Authorization: `Bearer ${apiKey}` },
    };
  if (type === 'openai-compatible') {
    const headers: Record<string, string> = { ...connection.headers };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return { url: `${connection.baseUrl}/models`, headers };
  }
  const base = connection.baseUrl ?? `https://${connection.resourceName ?? ''}.openai.azure.com`;
  return {
    url: `${base}/openai/models?api-version=${encodeURIComponent(connection.apiVersion ?? AZURE_MODELS_API_VERSION)}`,
    headers: { 'api-key': apiKey },
  };
}
