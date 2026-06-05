/** The marker logged in place of a secret value - never the value, set or unset. */
const REDACTED = '[redacted]';

/**
 * Secret leaf names in the connection contract (`connection.ts`): the `apiKey` field is secret by
 * name. Mirrors the known-secret-leaf approach in `partitionSecrets`, since a discriminated-union
 * schema cannot expose per-key record metadata to derive these automatically.
 */
const SECRET_FIELD_NAMES: ReadonlySet<string> = new Set(['apiKey']);

/**
 * Record fields whose every VALUE is secret. A connection's `headers` (openai-compatible) carries
 * secret header values under arbitrary keys, so each value is redacted while the keys are preserved.
 */
const SECRET_VALUE_RECORD_NAMES: ReadonlySet<string> = new Set(['headers']);

/**
 * Connection host/config fields redacted in logs. They are NOT secrets (they ride the public
 * connections wire), but the never-log rule forbids logging a connection's `baseUrl` (it can reveal a
 * private LAN/VPN host) or an Azure `resourceName` (a host identifier); `apiVersion` is redacted with
 * them so the whole host-config triple is uniformly absent from logs (ADR 0023, ADR 0007).
 */
const HOST_FIELD_NAMES: ReadonlySet<string> = new Set(['baseUrl', 'resourceName', 'apiVersion']);

/** Whether a value is a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Produce a content-safe copy of a settings PATCH body for logging: every value is preserved EXCEPT
 * secret leaves and connection host fields, whose values become `'[redacted]'`. A connection's
 * `apiKey` is redacted by name; every value inside a `headers` record is redacted (keys kept); and a
 * connection's `baseUrl`, `resourceName`, and `apiVersion` are redacted by name (the never-log-base-URL
 * rule). Other settings values are configuration (not prompt/response content), so logging them with
 * secrets and host config stripped is content-safe and answers "which setting changed to what".
 *
 * @param patch - The raw PATCH body (arbitrary JSON the client sent).
 * @returns A deep copy with every secret value and host field redacted.
 */
export function redactSettingsPatch(patch: unknown): unknown {
  if (Array.isArray(patch)) {
    return patch.map((item) => redactSettingsPatch(item));
  }
  if (isPlainObject(patch)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (SECRET_FIELD_NAMES.has(key) || HOST_FIELD_NAMES.has(key)) {
        out[key] = REDACTED;
      } else if (SECRET_VALUE_RECORD_NAMES.has(key) && isPlainObject(value)) {
        const redactedRecord: Record<string, unknown> = {};
        for (const headerKey of Object.keys(value)) {
          redactedRecord[headerKey] = REDACTED;
        }
        out[key] = redactedRecord;
      } else {
        out[key] = redactSettingsPatch(value);
      }
    }
    return out;
  }
  return patch;
}
