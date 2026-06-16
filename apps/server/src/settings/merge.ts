import type { Settings } from '@anvika/shared/settings/schema';

/**
 * Apply a PATCH body to the current settings, returning a plain object the caller MUST
 * re-validate against `SettingsSchema` (the merge does no validation - that full re-validate is the
 * real guarantee). Top-level keys replace when present; `connections` replaces the whole array (a
 * PATCH supplies the complete intended array - element-level upsert is a later UI concern);
 * `hotkeyBindings` merges per-action; omitted keys keep their stored value. Pure and deterministic,
 * unit-tested per rule.
 *
 * @param current - The current full settings object.
 * @param patch - The (shallow-validated) PATCH body - any JSON object.
 * @returns The merged object, pending re-validation.
 */
export function mergeSettingsPatch(current: Settings, patch: Record<string, unknown>): unknown {
  const out: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'hotkeyBindings' && value !== null && typeof value === 'object') {
      out.hotkeyBindings = { ...current.hotkeyBindings, ...(value as Record<string, unknown>) };
    } else {
      out[key] = value;
    }
  }
  return out;
}
