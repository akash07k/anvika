import type { Connection } from '@anvika/shared/settings/connection';
import type { SetConnectionSecret, TestConfigOverride } from '@anvika/shared/connections/contracts';
import type { RedactedConnection } from '@anvika/shared/settings/redact';

import { assembleConnection } from './assembleProbeConnection';
import { type ConnectionDraft, assembleSecretPatch } from './connectionDraft';

/** Read an optional public string field off a redacted connection (they are optional per type). */
function existingField(existing: RedactedConnection | undefined, key: string): string {
  const source = existing as Record<string, unknown> | undefined;
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Build the non-secret config-override for an edit-mode Test: the probe-relevant public fields
 * (`baseUrl`, `resourceName`, `apiVersion`) whose TRIMMED draft value DIFFERS from the stored
 * (redacted) connection's value. A field is included only when it changed (conditional spreads, so
 * `undefined` is never assigned under `exactOptionalPropertyTypes`). Returns `undefined` when nothing
 * changed, so the caller omits `config` entirely.
 *
 * @param draft - The editable draft.
 * @param existing - The redacted connection being edited, or `undefined`.
 * @returns The config-override, or `undefined` when no probe-relevant field changed.
 */
export function configOverrideFor(
  draft: ConnectionDraft,
  existing?: RedactedConnection,
): TestConfigOverride | undefined {
  const baseUrl = draft.baseUrl.trim();
  const resourceName = draft.resourceName.trim();
  const apiVersion = draft.apiVersion.trim();
  const config: TestConfigOverride = {
    ...(baseUrl !== existingField(existing, 'baseUrl') ? { baseUrl } : {}),
    ...(resourceName !== existingField(existing, 'resourceName') ? { resourceName } : {}),
    ...(apiVersion !== existingField(existing, 'apiVersion') ? { apiVersion } : {}),
  };
  return Object.keys(config).length > 0 ? config : undefined;
}

/**
 * Build a test-connection request for the current draft. On add it probes the full assembled
 * connection (which legitimately carries the typed secrets transiently). On edit it probes the saved
 * connection by id, attaching a secret `override` ONLY when a secret actually changed and a non-secret
 * `config` override ONLY when a probe-relevant public field (baseUrl/resourceName/apiVersion) changed
 * - so an untouched stored key is never re-sent, the stored key stays server-side while a config edit
 * is still reflected, and `undefined` is never assigned (conditional spread).
 *
 * @param draft - The editable draft.
 * @param mode - `'add'` probes the full connection; `'edit'` probes by id with overrides.
 * @param existing - The redacted connection being edited (edit mode), or `undefined`.
 * @returns The test-connection request payload.
 */
export function testRequestFor(
  draft: ConnectionDraft,
  mode: 'add' | 'edit',
  existing?: RedactedConnection,
):
  | { connection: Connection }
  | { connectionId: string; override?: SetConnectionSecret; config?: TestConfigOverride } {
  if (mode === 'add') return { connection: assembleConnection(draft) };
  const secret = assembleSecretPatch(draft, existing);
  const config = configOverrideFor(draft, existing);
  return {
    connectionId: draft.id,
    ...(secret ? { override: secret } : {}),
    ...(config ? { config } : {}),
  };
}
