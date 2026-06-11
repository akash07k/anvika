// packages/shared/src/settings/redact.ts
import type { z } from 'zod';

import type { Connection } from './connection';
import type { RedactedConnectionSchema, RedactedSettingsSchema } from './redacted';
import type { Settings } from './schema';

export { IsSetSchema, RedactedConnectionSchema, RedactedSettingsSchema } from './redacted';
export type { IsSet } from './redacted';

/**
 * A redacted connection, with secrets collapsed to `{ isSet }`. The TYPE is derived from
 * {@link RedactedConnectionSchema} (single source of truth) so it can never drift from the validator.
 */
export type RedactedConnection = z.infer<typeof RedactedConnectionSchema>;

/**
 * The settings shape returned by GET: identical to {@link Settings} but with connection secrets
 * redacted. The TYPE is derived from {@link RedactedSettingsSchema} (single source of truth).
 */
export type RedactedSettings = z.infer<typeof RedactedSettingsSchema>;

/** Redact one connection: apiKey and each header value become `{ isSet }`. */
function redactConnection(connection: Connection): RedactedConnection {
  const source = connection as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };
  out['apiKey'] = { isSet: typeof source['apiKey'] === 'string' && source['apiKey'].length > 0 };
  if (
    source['headers'] !== undefined &&
    typeof source['headers'] === 'object' &&
    source['headers'] !== null
  ) {
    const headers: Record<string, { isSet: boolean }> = {};
    for (const [k, v] of Object.entries(source['headers'] as Record<string, unknown>)) {
      headers[k] = { isSet: typeof v === 'string' && v.length > 0 };
    }
    out['headers'] = headers;
  }
  return out as RedactedConnection;
}

/**
 * Derive the redacted GET view from validated settings: every connection `apiKey` becomes `{ isSet }`
 * and every header value becomes `{ isSet }`; everything else passes through. The server holds the
 * plaintext; this projection is what crosses the HTTP boundary, so secrets never leave the server.
 *
 * @param settings - The validated, plaintext settings object.
 * @returns The redacted view safe to return from `GET /api/v1/settings`.
 */
export function redactSecrets(settings: Settings): RedactedSettings {
  return { ...settings, connections: settings.connections.map(redactConnection) };
}
