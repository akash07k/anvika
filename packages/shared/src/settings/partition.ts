// packages/shared/src/settings/partition.ts
import type { Settings } from './schema';

/** The result of splitting settings into a non-secret part and a secret-only part. */
export interface PartitionedSettings {
  /** Non-secret settings (every secret leaf removed). */
  public: Record<string, unknown>;
  /** Secret leaves only, keyed by connection id. */
  secrets: Record<string, unknown>;
}

/** Narrow an unknown to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Split validated settings into a non-secret `public` tree and a `secrets` tree holding only the
 * secret leaves of each connection (`apiKey` and every `headers` value - the fields the schema marks
 * `secret: true` / documents as secret-valued). Secrets are keyed by connection id under
 * `secrets.connections`. A connection with no secret leaf contributes nothing to `secrets`.
 *
 * @param settings - The validated, plaintext settings object.
 * @returns The `public` and `secrets` trees (each safe to JSON-serialize to its own file).
 */
export function partitionSecrets(settings: Settings): PartitionedSettings {
  const publicConnections: Record<string, unknown>[] = [];
  const secretConnections: Record<string, { apiKey?: string; headers?: Record<string, string> }> =
    {};

  for (const connection of settings.connections) {
    const pub: Record<string, unknown> = { ...connection } as Record<string, unknown>;
    const secretLeaf: { apiKey?: string; headers?: Record<string, string> } = {};

    if (typeof pub.apiKey === 'string' && pub.apiKey.length > 0) {
      secretLeaf.apiKey = pub.apiKey;
      delete pub.apiKey;
    }

    if (isRecord(pub.headers)) {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(pub.headers)) {
        if (typeof v === 'string') headers[k] = v;
      }
      if (Object.keys(headers).length > 0) secretLeaf.headers = headers;
      delete pub.headers;
    }

    publicConnections.push(pub);
    if (Object.keys(secretLeaf).length > 0) secretConnections[connection.id] = secretLeaf;
  }

  const pub: Record<string, unknown> = { ...settings, connections: publicConnections };
  const secrets =
    Object.keys(secretConnections).length > 0 ? { connections: secretConnections } : {};
  return { public: pub, secrets };
}

/**
 * Recombine a `public` tree and a `secrets` tree into one settings object (the inverse of
 * {@link partitionSecrets}), re-attaching each connection's `apiKey`/`headers` by id. Secret leaves
 * whose connection id is not present in the public tree are dropped (so a stale orphaned secret from a
 * removed connection falls away). Tolerant of missing/non-object inputs; the caller validates.
 *
 * @param pub - The non-secret tree (from `settings.json`).
 * @param secrets - The secret tree (from `secrets.json`), possibly empty.
 * @returns The merged settings object (unvalidated).
 */
export function mergeSecrets(pub: unknown, secrets: unknown): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(pub) ? { ...pub } : {};
  const connections = Array.isArray(base.connections) ? base.connections : [];
  const secretConnections =
    isRecord(secrets) && isRecord(secrets.connections) ? secrets.connections : {};

  base.connections = connections.map((conn) => {
    if (!isRecord(conn) || typeof conn.id !== 'string') return conn;
    const secret = secretConnections[conn.id];
    if (!isRecord(secret)) return conn;
    const merged: Record<string, unknown> = { ...conn };
    if (typeof secret.apiKey === 'string') merged.apiKey = secret.apiKey;
    if (isRecord(secret.headers)) merged.headers = { ...secret.headers };
    return merged;
  });

  return base;
}
