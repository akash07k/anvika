import { CURRENT_SETTINGS_VERSION } from '@anvika/shared/settings/schema';

/**
 * A forward migration: transform the settings shape at version N into the shape at version N+1. It
 * receives the raw on-disk JSON, which is untrusted - the version-range guard in `loadSettings`
 * bounds the version but not the shape - so a real migration must read defensively and never assume
 * the input is a well-formed object.
 */
export type SettingsMigration = (data: unknown) => unknown;

/**
 * The settings migration registry. Key `N` upgrades a row written at version N to N+1. It is empty
 * at the v1 baseline: the public repository ships no historical migrations. The generic
 * {@link migrateSettings} chainer is kept so a future schema change registers its step here and
 * bumps `CURRENT_SETTINGS_VERSION`; until then every stored row is already at the current version
 * (or fails the version-range guard in `loadSettings`).
 */
export const settingsMigrations: Record<number, SettingsMigration> = {};

/**
 * Apply forward migrations to `data` from `fromVersion` up to `toVersion`, in order, skipping
 * versions with no registered migration. Pure and deterministic; the registry is injectable so the
 * chaining is testable before any real migration exists.
 *
 * @param data - The stored settings JSON at `fromVersion`.
 * @param fromVersion - The version the row was written at.
 * @param toVersion - The target version (defaults to {@link CURRENT_SETTINGS_VERSION}).
 * @param registry - The migration registry (defaults to {@link settingsMigrations}).
 * @returns The migrated settings data, ready for schema validation.
 */
export function migrateSettings(
  data: unknown,
  fromVersion: number,
  toVersion: number = CURRENT_SETTINGS_VERSION,
  registry: Record<number, SettingsMigration> = settingsMigrations,
): unknown {
  let current = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const migration = registry[v];
    if (migration) current = migration(current);
  }
  return current;
}
