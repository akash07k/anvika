import type { Connection } from '@anvika/shared/settings/connection';
import type { Settings } from '@anvika/shared/settings/schema';

/** Narrow an unknown to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Index the stored connections by id for by-id secret lookup. */
function indexStored(stored: Settings): Map<string, Connection> {
  const byId = new Map<string, Connection>();
  for (const connection of stored.connections) byId.set(connection.id, connection);
  return byId;
}

/** A shallow copy of a connection with both secret fields removed (the public projection). */
function stripSecrets(connection: Record<string, unknown>): Record<string, unknown> {
  const { apiKey: _apiKey, headers: _headers, ...publicFields } = connection;
  return publicFields;
}

/** The stored secret fields to overlay: a non-empty `apiKey` string and a `headers` record. */
function storedSecretsOf(stored: Connection): {
  apiKey?: string;
  headers?: Record<string, string>;
} {
  const apiKey = (stored as { apiKey?: unknown }).apiKey;
  const headers = (stored as { headers?: unknown }).headers;
  return {
    ...(typeof apiKey === 'string' && apiKey.length > 0 ? { apiKey } : {}),
    ...(isRecord(headers) ? { headers: headers as Record<string, string> } : {}),
  };
}

/**
 * Project one incoming connection to its public (secret-free) shape, then overlay the stored
 * secrets for its id ONLY when the stored counterpart exists AND its type matches the incoming
 * connection's type.
 *
 * Type-mismatch rule: if the incoming connection carries a different `type` than the stored
 * connection for the same id, the stored secret is NOT overlaid - the result is secret-free,
 * identical to a brand-new connection. This prevents a stale secret from one provider type
 * (e.g. openai `apiKey`) from silently leaking onto a connection that has been re-typed to a
 * different provider (e.g. openai-compatible). A non-record or id-less connection cannot match
 * a stored secret, so it passes through with secrets stripped (and a non-record passes through
 * as-is). An incoming connection whose `type` is absent or not a string is treated as a
 * non-match: the type cannot be confirmed, so the overlay is skipped.
 */
function attachOne(connection: unknown, byId: Map<string, Connection>): unknown {
  if (!isRecord(connection)) return connection;
  const projection = stripSecrets(connection);
  if (typeof connection.id !== 'string') return projection;
  const stored = byId.get(connection.id);
  if (!stored) return projection;
  if (typeof connection.type !== 'string' || connection.type !== stored.type) return projection;
  return { ...projection, ...storedSecretsOf(stored) };
}

/**
 * Re-attach stored connection secrets onto a merged settings object by connection id, so a PATCH that
 * resends the full public `connections` array to edit one connection does not wipe its siblings'
 * secrets - while making it STRUCTURALLY IMPOSSIBLE for that PATCH to write a secret.
 *
 * Security contract (the whole point): the connections array on a `/settings` PATCH is PURE public
 * config. For every incoming connection this function FIRST strips `apiKey` and `headers`
 * unconditionally (the public projection), THEN overlays the stored secret for that id ONLY when the
 * stored connection's `type` matches the incoming connection's `type`. The strip is the guarantee:
 * because the Zod connection variants are not `.strict()`, a sneaked `apiKey`/`headers` on the wire
 * would otherwise survive validation (the variant declares those keys), so validation alone cannot
 * drop it - the strip here does.
 *
 * Overlay rules by case:
 * - Brand-new connection (no stored match): secret-free.
 * - Same id, same type: stored secret overlaid (the normal edit path).
 * - Same id, different type (type change): secret-free. The stale secret from the old provider type
 *   is NOT carried onto the new type. The connection behaves like a brand-new one and must be
 *   re-credentialed via `PUT /api/v1/connections/:id/secret`.
 * - Same id, incoming type absent or not a string: treated as a non-match, secret-free.
 *
 * The ONLY secret-write channel is `PUT /api/v1/connections/:id/secret`.
 *
 * There is no `''` keep-signal and no omit-means-keep ambiguity - those mechanics are gone. The
 * function is pure: no IO, no logging, only plain object fields moved between new objects.
 *
 * @param merged - The merged settings object pending validation (any JSON object).
 * @param stored - The previously-loaded, plaintext settings to overlay secrets from.
 * @returns A new object identical to `merged` with secrets stripped and stored secrets overlaid by
 *   id, or `merged` unchanged when `merged.connections` is not an array.
 */
export function attachStoredSecrets(merged: unknown, stored: Settings): unknown {
  if (!isRecord(merged) || !Array.isArray(merged.connections)) return merged;
  const byId = indexStored(stored);
  return {
    ...merged,
    connections: merged.connections.map((connection) => attachOne(connection, byId)),
  };
}
