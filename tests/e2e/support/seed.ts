import type { APIRequestContext } from '@playwright/test';

/** A seed connection: public config plus optional secrets (apiKey, header values). */
export interface SeedConnection {
  /** Stable connection id; also the path segment for the secret PUT. */
  id: string;
  /** Human-readable label shown in the connections UI. */
  label: string;
  /** Provider type discriminator (e.g. `anthropic`, `azure`, `openai`). */
  type: string;
  /** Optional base URL for openai-compatible / custom endpoints. */
  baseUrl?: string;
  /** Azure resource name (Azure-only public config). */
  resourceName?: string;
  /** Azure API version (Azure-only public config). */
  apiVersion?: string;
  /** Manually listed model ids (membership for providers without a data-plane listing). */
  manualModelIds?: string[];
  /** Secret API key; travels only via the secret PUT, never the connections wire. */
  apiKey?: string;
  /** Secret header values; travel only via the secret PUT, never the connections wire. */
  headers?: Record<string, string>;
}

/** A settings seed: connections (split into public + secret) plus any other top-level settings fields. */
export interface SeedData {
  /** The connections to seed; each is split into a public part and a secret part. */
  connections?: SeedConnection[];
  /** Any other top-level settings fields (e.g. `selectedModelId`), passed through to the PATCH. */
  [key: string]: unknown;
}

/**
 * Seed settings the Option-C way: PATCH the PUBLIC connections (+ any other settings fields), then PUT each
 * connection's secret by id (so secrets never ride the connections wire). A connection with no apiKey/headers
 * gets no PUT (e.g. a live spec when the Azure env var is unset). Throws on a non-ok response so a broken
 * seed fails the test loudly rather than silently leaving the app unconfigured.
 *
 * @param request - The Playwright API request context bound to the e2e server's base URL.
 * @param data - The settings seed: optional connections (split into public + secret) plus any other
 *   top-level settings fields to PATCH alongside them.
 * @returns A promise that resolves once the public PATCH and every secret PUT have succeeded.
 * @throws If the settings PATCH or any secret PUT returns a non-ok response.
 */
export async function seedSettings(request: APIRequestContext, data: SeedData): Promise<void> {
  const { connections, ...rest } = data;
  const patchData: Record<string, unknown> = { ...rest };
  if (connections !== undefined) {
    // Strip the secret fields (apiKey, headers) so they never ride the connections wire; they travel
    // only via the per-id secret PUT below (Option C).
    patchData.connections = connections.map((conn) => {
      const pub: Record<string, unknown> = { ...conn };
      delete pub.apiKey;
      delete pub.headers;
      return pub;
    });
  }
  const patched = await request.patch('/api/v1/settings', { data: patchData });
  if (!patched.ok()) throw new Error(`seed settings PATCH failed: ${patched.status()}`);
  for (const conn of connections ?? []) {
    const secret: Record<string, unknown> = {};
    if (conn.apiKey !== undefined) secret.apiKey = conn.apiKey;
    if (conn.headers !== undefined) secret.headers = conn.headers;
    if (Object.keys(secret).length === 0) continue;
    const put = await request.put(`/api/v1/connections/${conn.id}/secret`, { data: secret });
    if (!put.ok()) throw new Error(`seed secret PUT failed for ${conn.id}: ${put.status()}`);
  }
}
