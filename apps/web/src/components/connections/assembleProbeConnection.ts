import type { Connection } from '@anvika/shared/settings/connection';

import type { ConnectionDraft } from './connectionDraft';
import type { HeaderRow } from './HeadersEditor';

/** Trim the draft's manual model ids, dropping empties. */
function trimmedModels(draft: ConnectionDraft): string[] {
  return draft.manualModelIds.map((id) => id.trim()).filter((id) => id.length > 0);
}

/**
 * Whether a header row belongs on the add-flow probe object: a non-empty trimmed NAME AND a non-empty
 * typed VALUE, mirroring {@link assembleSecretPatch}'s persist rule, so a Test never probes a name-only
 * header that Save would silently drop. The narrowed type proves the value is present after filtering.
 */
function includeHeaderRow(row: HeaderRow): row is HeaderRow & { value: string } {
  return row.name.trim().length > 0 && row.value !== undefined && row.value.length > 0;
}

/**
 * Assemble a FULL {@link Connection} from a draft, used ONLY for the add-flow test probe
 * (`{ connection }`), which legitimately carries typed secrets transiently. Header rows are filtered
 * by {@link includeHeaderRow} (name + value, matching the secret-patch persist rule); `apiKey` is
 * included only when (re-)typed and non-empty. Conditional spreads keep `exactOptionalPropertyTypes`
 * happy (no field is ever assigned `undefined`).
 *
 * @param draft - The editable draft.
 * @returns The candidate full connection object, shaped but not yet validated.
 */
export function assembleConnection(draft: ConnectionDraft): Connection {
  const models = trimmedModels(draft);
  const headerPairs = draft.headers.filter(includeHeaderRow).map((r) => [r.name, r.value] as const);
  const base = {
    id: draft.id,
    type: draft.type,
    label: draft.label,
    ...(draft.apiKeyDirty && draft.apiKey ? { apiKey: draft.apiKey } : {}),
    ...(draft.baseUrl.trim() ? { baseUrl: draft.baseUrl.trim() } : {}),
    ...(draft.resourceName.trim() ? { resourceName: draft.resourceName.trim() } : {}),
    ...(draft.apiVersion.trim() ? { apiVersion: draft.apiVersion.trim() } : {}),
    ...(models.length > 0 ? { manualModelIds: models } : {}),
    ...(headerPairs.length > 0 ? { headers: Object.fromEntries(headerPairs) } : {}),
  };
  return base as Connection;
}
