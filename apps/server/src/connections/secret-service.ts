import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import {
  CURRENT_SETTINGS_VERSION,
  SettingsSchema,
  type Settings,
} from '@anvika/shared/settings/schema';
import type { $ZodIssue } from 'zod/v4/core';

import type { SettingsStore } from '../persistence/ports';
import { loadSettings } from '../settings/service';
import { applyConnectionSecret } from './secret-apply';

/**
 * The result of `setConnectionSecret`: success with the persisted version and settings, a `not-found`
 * miss (no connection with that id), or a `validation` failure (the patch was rejected before persist
 * - for example a `headers` map set on a native key type is explicitly rejected here, since `headers`
 * are only supported on an `openai-compatible` connection). Mirrors `PatchResult`'s discriminated-union
 * style; there is no `file-invalid` branch because a prior unreadable file resolves to empty defaults
 * (see {@link setConnectionSecret}).
 */
export type SetSecretResult =
  | { ok: true; version: number; settings: Settings }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'validation'; issues: $ZodIssue[] };

/**
 * Apply a secret-patch to a single saved connection by id and persist the whole settings object. The
 * current settings are loaded (recovering to empty defaults when the on-disk file was unreadable, so a
 * connection in a broken file is simply not found - no separate `file-invalid` branch is needed); the
 * connection with `id` is located; the patch is applied with {@link applyConnectionSecret} (set/clear/
 * keep per secret field); the result replaces the same-id connection in the array while every other
 * connection and setting is preserved; the WHOLE candidate is validated against {@link SettingsSchema};
 * and on success it is upserted at {@link CURRENT_SETTINGS_VERSION}.
 *
 * Plaintext secrets are moved between plain objects here (the server is the legitimate plaintext
 * holder); no secret value is ever logged or returned beyond the persisted settings object itself.
 *
 * @param store - The settings store port.
 * @param owner - The settings owner.
 * @param id - The id of the connection whose secrets are being patched.
 * @param patch - The secret-patch (set with a string, clear with `null`, keep when absent).
 * @returns The result: success, a `not-found` miss, or a `validation` failure (nothing persisted).
 */
export async function setConnectionSecret(
  store: SettingsStore,
  owner: string,
  id: string,
  patch: SetConnectionSecret,
): Promise<SetSecretResult> {
  const loaded = await loadSettings(store, owner);
  const found = loaded.settings.connections.find((c) => c.id === id);
  if (!found) {
    return { ok: false, reason: 'not-found' };
  }
  if (patch.headers !== undefined && found.type !== 'openai-compatible') {
    // Headers belong only to an openai-compatible connection. The native variants are non-strict
    // z.objects, so Zod would silently STRIP a patched `headers` key and let the parse succeed;
    // reject explicitly instead. The issue is content-safe: it names neither a header key nor value.
    const issue: $ZodIssue = {
      code: 'custom',
      path: ['headers'],
      message: 'Headers are only supported on an openai-compatible connection',
    };
    return { ok: false, reason: 'validation', issues: [issue] };
  }
  const updated = applyConnectionSecret(found, patch);
  const candidate: Settings = {
    ...loaded.settings,
    connections: loaded.settings.connections.map((c) => (c.id === id ? updated : c)),
  };
  const parsed = SettingsSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, reason: 'validation', issues: parsed.error.issues };
  }
  await store.save(owner, parsed.data, CURRENT_SETTINGS_VERSION);
  return { ok: true, version: CURRENT_SETTINGS_VERSION, settings: parsed.data };
}
