import {
  type ConnectionType,
  type PublicConnection,
  ConnectionSchema,
} from '@anvika/shared/settings/connection';
import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { RedactedConnection } from '@anvika/shared/settings/redact';
import {
  ReasoningEffortOverrideSchema,
  type ReasoningEffortOverride,
} from '@anvika/shared/reasoning/effort';

import type { HeaderRow } from './HeadersEditor';
import { readHeaders } from './connectionsWire';

/**
 * The editable draft backing {@link ConnectionForm}. Secret values (`apiKey`, header values) live
 * here only transiently and are tracked as dirty; the public connection wire never carries them.
 * Secrets instead travel out of band via a separate secret-patch (see {@link assembleSecretPatch}),
 * sent to `PUT /api/v1/connections/:id/secret`.
 */
export interface ConnectionDraft {
  /** The chosen connection type. */
  type: ConnectionType;
  /** The connection id (slug). */
  id: string;
  /** Whether the user has manually edited the id, which freezes auto-derivation. */
  idEdited: boolean;
  /** The connection label. */
  label: string;
  /** Optional base URL (override or required, per type). */
  baseUrl: string;
  /** Azure resource name. */
  resourceName: string;
  /** Azure API version. */
  apiVersion: string;
  /** A secret API key typed this session, or `undefined` when none was entered. */
  apiKey: string | undefined;
  /** Whether the API key was (re-)typed this session. */
  apiKeyDirty: boolean;
  /** The header rows. */
  headers: HeaderRow[];
  /** The manual model IDs. */
  manualModelIds: string[];
  /** Whether to send the openai-compatible extended-thinking params (openai-compatible only). */
  sendThinkingParams: boolean;
  /** The per-connection thinking-effort override; `'inherit'` defers to the global setting. */
  reasoningEffort: ReasoningEffortOverride;
}

/** Build the initial empty draft for add mode at the given default type. */
export function emptyDraft(type: ConnectionType): ConnectionDraft {
  return {
    type,
    id: '',
    idEdited: false,
    label: '',
    baseUrl: '',
    resourceName: '',
    apiVersion: '',
    apiKey: undefined,
    apiKeyDirty: false,
    headers: [],
    manualModelIds: [],
    sendThinkingParams: true,
    reasoningEffort: 'inherit',
  };
}

/** Build the initial draft for edit mode, pre-filling non-secret fields from the redacted view. */
export function draftFromExisting(existing: RedactedConnection): ConnectionDraft {
  const source = existing as Record<string, unknown>;
  const headerEntries = readHeaders(existing) ?? {};
  return {
    type: existing.type,
    id: existing.id,
    idEdited: true,
    label: existing.label,
    baseUrl: typeof source['baseUrl'] === 'string' ? source['baseUrl'] : '',
    resourceName: typeof source['resourceName'] === 'string' ? source['resourceName'] : '',
    apiVersion: typeof source['apiVersion'] === 'string' ? source['apiVersion'] : '',
    apiKey: undefined,
    apiKeyDirty: false,
    headers: Object.entries(headerEntries).map(([name, v]) => ({ name, isSet: v.isSet })),
    manualModelIds: existing.manualModelIds ?? [],
    sendThinkingParams:
      typeof source['sendThinkingParams'] === 'boolean' ? source['sendThinkingParams'] : true,
    reasoningEffort: (() => {
      const parsed = ReasoningEffortOverrideSchema.safeParse(source['reasoningEffort']);
      return parsed.success ? parsed.data : 'inherit';
    })(),
  };
}

/** Trim the draft's manual model ids, dropping empties. */
function trimmedModels(draft: ConnectionDraft): string[] {
  return draft.manualModelIds.map((id) => id.trim()).filter((id) => id.length > 0);
}

/**
 * Assemble the PUBLIC connection wire shape from a draft using conditional spreads (never assigning
 * `undefined`, since `exactOptionalPropertyTypes` is on). Optional non-secret fields are included
 * only when non-empty. No `apiKey` and no `headers` are ever emitted - secrets travel separately via
 * {@link assembleSecretPatch}.
 *
 * On edit, the existing connection's `enabled` flag is preserved. On add (`existing` absent), the
 * flag defaults to `true` so a new connection is active by default.
 *
 * @param draft - The editable draft.
 * @param existing - The redacted connection being edited, or `undefined` when adding a new one.
 * @returns The candidate public connection, shaped but not yet validated.
 */
export function assemblePublicConnection(
  draft: ConnectionDraft,
  existing?: RedactedConnection,
): PublicConnection {
  const models = trimmedModels(draft);
  return {
    id: draft.id,
    type: draft.type,
    label: draft.label,
    // Preserve the existing active state on edit; a new connection is active by default.
    enabled: existing?.enabled ?? true,
    ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
    ...(draft.resourceName.trim() ? { resourceName: draft.resourceName.trim() } : {}),
    ...(draft.apiVersion.trim() ? { apiVersion: draft.apiVersion.trim() } : {}),
    ...(models.length > 0 ? { manualModelIds: models } : {}),
    ...(draft.type === 'openai-compatible' ? { sendThinkingParams: draft.sendThinkingParams } : {}),
    reasoningEffort: draft.reasoningEffort,
  } as PublicConnection;
}

/** The draft rows' trimmed, non-empty header names (the names that survive to the wire). */
function draftHeaderNames(draft: ConnectionDraft): string[] {
  return draft.headers.map((r) => r.name.trim()).filter((name) => name.length > 0);
}

/**
 * Assemble the out-of-band secret-patch for a draft, for `PUT /api/v1/connections/:id/secret`. The
 * patch SETS a value with a string, CLEARS it with `null`, and LEAVES it unchanged by omission:
 *
 * - `apiKey` is set only when (re-)typed this session (`apiKeyDirty` and non-empty); otherwise it is
 *   omitted (the stored key is kept).
 * - A header is SET when its row has a non-empty trimmed name and a non-empty typed value.
 * - A header present in `existing` whose name is absent from the draft rows is CLEARED (`null`).
 * - An untouched stored header (name present, no typed value) is omitted, so its stored value is
 *   kept.
 *
 * Returns the patch when it carries an `apiKey` or any `headers`, else `null` (nothing to write).
 *
 * NOTE: renaming a header without re-entering its value DROPS the value - the client holds only the
 * write-only `{ isSet }` marker and cannot move a secret it cannot read, so the old name is cleared
 * and the new name has no value to set. Re-enter the value to rename a header.
 *
 * @param draft - The editable draft.
 * @param existing - The redacted connection being edited (for clear detection), or `undefined` on add.
 * @returns The secret-patch, or `null` when nothing secret changed.
 */
export function assembleSecretPatch(
  draft: ConnectionDraft,
  existing?: RedactedConnection,
): SetConnectionSecret | null {
  const headers: Record<string, string | null> = {};
  for (const row of draft.headers) {
    const name = row.name.trim();
    if (name.length > 0 && row.value !== undefined && row.value.length > 0) {
      headers[name] = row.value;
    }
  }
  const draftNames = new Set(draftHeaderNames(draft));
  const existingHeaders = existing ? readHeaders(existing) : undefined;
  for (const name of Object.keys(existingHeaders ?? {})) {
    if (!draftNames.has(name)) headers[name] = null;
  }
  const hasApiKey = draft.apiKeyDirty && draft.apiKey !== undefined && draft.apiKey.length > 0;
  const hasHeaders = Object.keys(headers).length > 0;
  if (!hasApiKey && !hasHeaders) return null;
  return {
    ...(hasApiKey ? { apiKey: draft.apiKey } : {}),
    ...(hasHeaders ? { headers } : {}),
  };
}

/**
 * Validate a draft's PUBLIC connection against {@link ConnectionSchema}; returns the parse result. A
 * keyless public connection is valid because `apiKey` is optional in the schema, so the form can
 * validate structure independently of the secret-patch.
 */
export function validateDraft(
  draft: ConnectionDraft,
): ReturnType<typeof ConnectionSchema.safeParse> {
  return ConnectionSchema.safeParse(assemblePublicConnection(draft));
}
