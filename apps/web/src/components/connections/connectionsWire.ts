import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { IsSet, RedactedConnection } from '@anvika/shared/settings/redact';

/** Read a non-empty string field off a redacted connection, or `undefined`. */
function readString(connection: RedactedConnection, key: string): string | undefined {
  const value = (connection as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Read the redacted `headers` record off a connection, or `undefined`. Only the openai-compatible
 * variant carries headers; the discriminated union scopes the field to that variant, so this narrows
 * before access (no blind cast). The values are `{ isSet }`, never plaintext.
 *
 * @param connection - The redacted connection the client holds.
 * @returns The redacted headers record, or `undefined` when the variant has none.
 */
export function readHeaders(connection: RedactedConnection): Record<string, IsSet> | undefined {
  return connection.type === 'openai-compatible' ? connection.headers : undefined;
}

/**
 * Project a redacted connection to its PUBLIC wire shape: drop `apiKey` and every header value
 * entirely (secrets never ride the connections array). Non-secret fields pass through, built with
 * conditional spreads so an absent optional field is never assigned `undefined`
 * (exactOptionalPropertyTypes).
 *
 * @param connection - The redacted connection the client holds (secrets as `{ isSet }`).
 * @returns The {@link PublicConnection} wire shape for a sibling on a full-array PATCH.
 */
export function redactedToPublic(connection: RedactedConnection): PublicConnection {
  const baseUrl = readString(connection, 'baseUrl');
  const resourceName = readString(connection, 'resourceName');
  const apiVersion = readString(connection, 'apiVersion');
  const manualModelIds = connection.manualModelIds;
  return {
    id: connection.id,
    type: connection.type,
    label: connection.label,
    enabled: connection.enabled,
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(resourceName !== undefined ? { resourceName } : {}),
    ...(apiVersion !== undefined ? { apiVersion } : {}),
    ...(manualModelIds && manualModelIds.length > 0 ? { manualModelIds } : {}),
  } as PublicConnection;
}

/**
 * Build the full PUBLIC connections array for an add/edit or remove. On add/edit, `changed` replaces
 * the same-id element or is appended; pass `changed: null` with `removeId` to drop a connection.
 * Every sibling is projected via {@link redactedToPublic}, so no secret is ever sent on the
 * connections wire.
 *
 * @param existing - The current redacted connections array.
 * @param changed - The public connection to add/replace, or `null` for a remove.
 * @param removeId - The id to remove when `changed` is `null`.
 * @returns The new full PUBLIC connections array to PATCH.
 */
export function buildConnectionsPatch(
  existing: RedactedConnection[],
  changed: PublicConnection | null,
  removeId?: string,
): PublicConnection[] {
  if (changed === null) return existing.filter((c) => c.id !== removeId).map(redactedToPublic);
  const replaced = existing.some((c) => c.id === changed.id);
  if (replaced) return existing.map((c) => (c.id === changed.id ? changed : redactedToPublic(c)));
  return [...existing.map(redactedToPublic), changed];
}

/**
 * Project a PUBLIC connection to a redacted shape for the optimistic store update. The in-flight
 * secret patch is applied so added, removed, or changed secrets reflect immediately in the
 * `{ isSet }` flags - no stale flag persists until the server response. The server's redacted
 * response is still authoritative on the next read.
 *
 * apiKey rule: if `secret` is present and `secret.apiKey !== undefined`, derive `{ isSet }` from
 * whether the value is a string (true) or null (false). Otherwise keep the prior flag or default
 * to `{ isSet: false }`.
 *
 * headers rule (openai-compatible only): start from a copy of the prior redacted headers map, then
 * apply each entry in `secret.headers` - a string value sets `{ isSet: true }`, a null value
 * removes that key. The `headers` field is included only when the resulting map is non-empty
 * (exactOptionalPropertyTypes: conditional spread, never assign undefined).
 *
 * @param changed - The public connection just saved.
 * @param prior - The redacted connection it replaces (edit), or `undefined` on add.
 * @param secret - The in-flight secret patch for this save, or `undefined`/`null` when absent.
 * @returns The redacted projection to splice into the optimistic connections array.
 */
function publicToRedacted(
  changed: PublicConnection,
  prior?: RedactedConnection,
  secret?: SetConnectionSecret | null,
): RedactedConnection {
  // Compute the optimistic apiKey isSet flag.
  const apiKey: IsSet =
    secret !== undefined && secret !== null && secret.apiKey !== undefined
      ? { isSet: typeof secret.apiKey === 'string' }
      : (prior?.apiKey ?? { isSet: false });

  // Compute the optimistic headers map (start from prior, apply patch).
  const priorHeaders = prior ? readHeaders(prior) : undefined;
  const headersMap: Record<string, IsSet> = priorHeaders ? { ...priorHeaders } : {};
  if (secret?.headers !== undefined) {
    for (const [name, value] of Object.entries(secret.headers)) {
      if (value === null) {
        delete headersMap[name];
      } else {
        headersMap[name] = { isSet: true };
      }
    }
  }
  const hasHeaders = Object.keys(headersMap).length > 0;

  return {
    ...changed,
    apiKey,
    ...(hasHeaders ? { headers: headersMap } : {}),
  } as RedactedConnection;
}

/**
 * Optimistically splice a changed PUBLIC connection into the redacted array: replace the same-id
 * element or append on add. The in-flight secret patch is applied so added, removed, or changed
 * secrets reflect immediately in the `{ isSet }` flags - no stale flag persists until the server
 * response reconciles the true state on the next read.
 *
 * @param existing - The current redacted connections array.
 * @param changed - The public connection just saved.
 * @param secret - The in-flight secret patch for this save, or `undefined`/`null` when absent.
 * @returns The optimistic redacted array.
 */
export function optimisticConnections(
  existing: RedactedConnection[],
  changed: PublicConnection,
  secret?: SetConnectionSecret | null,
): RedactedConnection[] {
  const prior = existing.find((c) => c.id === changed.id);
  const projected = publicToRedacted(changed, prior, secret);
  if (prior) return existing.map((c) => (c.id === changed.id ? projected : c));
  return [...existing, projected];
}

/**
 * Extract the connection id prefix from a namespaced `connectionId:model` id: the substring before
 * the FIRST `:`. Returns `''` for both a colonless id AND a trailing-colon id (e.g. `work:`), fully
 * mirroring the server's `parseModelId` (which rejects a colonless id and a trailing colon) so a bare
 * or malformed id never spuriously matches a connection.
 *
 * @param modelId - A namespaced model id, e.g. `venice:llama-3`.
 * @returns The connection id before the first colon, or `''` when there is no colon or the colon is
 *   leading/trailing.
 */
export function parseConnectionId(modelId: string): string {
  const colon = modelId.indexOf(':');
  return colon > 0 && colon < modelId.length - 1 ? modelId.slice(0, colon) : '';
}

/** Whether a selected model id belongs to a connection (the id is the prefix before the first `:`). */
export function modelBelongsToConnection(selectedModelId: string, connectionId: string): boolean {
  const prefix = parseConnectionId(selectedModelId);
  if (prefix === '') return false;
  return prefix === connectionId;
}
