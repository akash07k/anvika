import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { Connection } from '@anvika/shared/settings/connection';

/**
 * The connection carrier shape for secret fields. `apiKey` is a native-type key; `headers` is the
 * `openai-compatible` per-key secret map. Both are optional on the union, so they are typed loosely
 * here and applied uniformly - the service (`setConnectionSecret`) is responsible for rejecting an
 * illegal combination (for example `headers` on a native type) before this helper ever runs.
 */
type SecretCarrier = { apiKey?: string; headers?: Record<string, string> };

/** Compute the next `apiKey` field: set from a string, drop on `null`, keep on `undefined`. */
function nextApiKey(connection: Connection, patch: SetConnectionSecret): { apiKey?: string } {
  if (patch.apiKey === undefined) {
    const current = (connection as SecretCarrier).apiKey;
    return current === undefined ? {} : { apiKey: current };
  }
  return patch.apiKey === null ? {} : { apiKey: patch.apiKey };
}

/** Compute the next `headers` map: set/clear per key over the existing map; drop the field if empty. */
function nextHeaders(
  connection: Connection,
  patch: SetConnectionSecret,
): { headers?: Record<string, string> } {
  const current = (connection as SecretCarrier).headers;
  if (patch.headers === undefined) {
    return current === undefined ? {} : { headers: { ...current } };
  }
  const merged: Record<string, string> = { ...current };
  for (const [key, value] of Object.entries(patch.headers)) {
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return Object.keys(merged).length === 0 ? {} : { headers: merged };
}

/**
 * Apply a secret-patch to a connection, returning a NEW connection (the input is never mutated). A
 * field in the patch SETS its value with a string, CLEARS it with `null`, and LEAVES it unchanged when
 * absent; for `headers`, the same set/clear/keep rule applies per individual key over the connection's
 * existing header map. When the resulting header map is empty, the `headers` field is omitted entirely
 * (never an empty `{}`). Conditional spreads guarantee no field is ever assigned `undefined`
 * (`exactOptionalPropertyTypes`).
 *
 * This is a PURE helper: it moves plaintext secret values between plain objects and does no
 * validation. It does not itself guard the headers-on-native combination - the service
 * (`setConnectionSecret`) explicitly rejects a `headers` patch on a non-openai-compatible type before
 * calling this helper, so by the time the values are moved here the combination is already legal.
 *
 * @param connection - The existing (validated) connection to base the result on.
 * @param patch - The secret-patch describing which secrets to set, clear, or keep.
 * @returns A new connection with the patch applied; the input is unchanged.
 */
export function applyConnectionSecret(
  connection: Connection,
  patch: SetConnectionSecret,
): Connection {
  const { apiKey: _apiKey, headers: _headers, ...rest } = connection as Connection & SecretCarrier;
  return {
    ...rest,
    ...nextApiKey(connection, patch),
    ...nextHeaders(connection, patch),
  } as Connection;
}
