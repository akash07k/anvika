import {
  CURRENT_SETTINGS_VERSION,
  SettingsSchema,
  type Settings,
} from '@anvika/shared/settings/schema';
import type { $ZodIssue } from 'zod/v4/core';

import { serverLogger } from '../logging/logger';
import type { SettingsStore } from '../persistence/ports';
import { attachStoredSecrets } from './attach-secrets';
import { mergeSettingsPatch } from './merge';
import { migrateSettings } from './migrations';

/** The result of `loadSettings`: the current version and the validated settings. */
export interface LoadedSettings {
  /** The current schema version. */
  version: number;
  /** The validated, plaintext settings (server-only). */
  settings: Settings;
  /** True when the stored settings could not be read/parsed and defaults were substituted. */
  recovered: boolean;
}

/**
 * The result of `patchSettings`: success with the new settings, a `validation` failure (the merged
 * settings did not parse), or a `file-invalid` refusal (the on-disk settings were unreadable and the
 * caller did not opt into overwriting them).
 */
export type PatchResult =
  | { ok: true; version: number; settings: Settings }
  | { ok: false; reason: 'validation'; issues: $ZodIssue[] }
  | { ok: false; reason: 'file-invalid' };

/** The schema defaults at the current version (substituted on first run or recovery). */
function defaultSettings(): { version: number; settings: Settings } {
  return { version: CURRENT_SETTINGS_VERSION, settings: SettingsSchema.parse({}) };
}

/**
 * Load the settings for `owner`: when no row exists, return the schema defaults at the current
 * version WITHOUT writing (lazy defaults); otherwise migrate the stored row up to the
 * current version and validate it. A store-read throw (an unreadable file) or a corrupt/unmigratable
 * row fails soft to defaults with `recovered: true` and a logged warning (no settings values are
 * logged - privacy), so a bad row never bricks settings (parallels the conversation read
 * boundary). A clean first run returns defaults with `recovered: false`.
 *
 * @param store - The settings store port.
 * @param owner - The settings owner.
 * @returns The current version, validated settings, and whether defaults were substituted.
 */
export async function loadSettings(store: SettingsStore, owner: string): Promise<LoadedSettings> {
  let row: Awaited<ReturnType<SettingsStore['load']>>;
  try {
    row = await store.load(owner);
  } catch (err) {
    serverLogger('settings').warn('settings could not be read; using defaults', {
      message: String(err),
    });
    return { ...defaultSettings(), recovered: true };
  }
  if (!row) {
    return { ...defaultSettings(), recovered: false };
  }
  if (!Number.isInteger(row.version) || row.version < 1 || row.version > CURRENT_SETTINGS_VERSION) {
    // A version this build does not understand (corrupt, or written by a newer build). Do not trust
    // the row: fail soft to defaults so settings never brick, and preserve the on-disk file
    // (recovered: true makes a later PATCH refuse with file-invalid unless the user opts to overwrite).
    // Content-safe: only the integer versions are logged, never settings values.
    serverLogger('settings').warn('stored settings version out of range; using defaults', {
      storedVersion: row.version,
      currentVersion: CURRENT_SETTINGS_VERSION,
    });
    return { ...defaultSettings(), recovered: true };
  }
  const migrated = migrateSettings(row.data, row.version);
  const parsed = SettingsSchema.safeParse(migrated);
  if (!parsed.success) {
    serverLogger('settings').warn('discarding unparseable settings row; using defaults', {
      message: parsed.error.message,
    });
    return { ...defaultSettings(), recovered: true };
  }
  return { version: CURRENT_SETTINGS_VERSION, settings: parsed.data, recovered: false };
}

/**
 * Apply a PATCH to the settings for `owner`: load the current settings (or defaults), deep-merge the
 * patch, validate the MERGED WHOLE, and on success upsert it at the current version and
 * return it; on a validation failure return `ok: false, reason: 'validation'` with the issues and
 * persist nothing. The row is created lazily here on the first successful PATCH.
 *
 * When the on-disk settings were unreadable (`loadSettings` recovered to defaults), a blind save would
 * silently clobber the broken-but-present file. So unless the caller passes `overwriteInvalid: true`
 * (an explicit user confirmation), the PATCH is refused with `reason: 'file-invalid'` and nothing is
 * written.
 *
 * When the patch touches `connections`, the array is treated as PURE public config: every incoming
 * secret (`apiKey`, header values) is STRIPPED and the stored secret for each id is re-attached (via
 * {@link attachStoredSecrets}) BEFORE validation. So resending the full array to edit one connection
 * never wipes its siblings' secrets, and a `/settings` PATCH is structurally incapable of writing a
 * secret - the only secret-write channel is `PUT /api/v1/connections/:id/secret`.
 *
 * A patch that sets `inrPerUsd` without supplying its own `inrPerUsdUpdatedAt` is stamped with the
 * current time (a manual rate edit records when it was made); the FX refresh path supplies the
 * timestamp explicitly, so it is never re-stamped.
 *
 * @param store - The settings store port.
 * @param owner - The settings owner.
 * @param body - The shallow-validated PATCH body (any JSON object).
 * @param options - Optional flags; `overwriteInvalid` permits saving over an unreadable file; `now`
 *   overrides the clock used to stamp `inrPerUsdUpdatedAt`.
 * @returns The patch result (success, a validation failure, or a file-invalid refusal).
 */
export async function patchSettings(
  store: SettingsStore,
  owner: string,
  body: Record<string, unknown>,
  options?: { overwriteInvalid?: boolean; now?: () => number },
): Promise<PatchResult> {
  const loaded = await loadSettings(store, owner);
  if (loaded.recovered && options?.overwriteInvalid !== true) {
    return { ok: false, reason: 'file-invalid' };
  }
  // Stamp the rate's last-updated time when a manual edit changes inrPerUsd without supplying its own
  // timestamp (the FX refresh supplies one explicitly, so it is not re-stamped).
  const stampedBody =
    'inrPerUsd' in body && !('inrPerUsdUpdatedAt' in body)
      ? { ...body, inrPerUsdUpdatedAt: (options?.now ?? Date.now)() }
      : body;
  const merged = mergeSettingsPatch(loaded.settings, stampedBody);
  const candidate = 'connections' in body ? attachStoredSecrets(merged, loaded.settings) : merged;
  const parsed = SettingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: 'validation', issues: parsed.error.issues };
  }
  await store.save(owner, parsed.data, CURRENT_SETTINGS_VERSION);
  return { ok: true, version: CURRENT_SETTINGS_VERSION, settings: parsed.data };
}
