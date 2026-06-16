import { CURRENT_SETTINGS_VERSION } from '@anvika/shared/settings/schema';
import { describe, expect, it } from 'vitest';

import { migrateSettings, settingsMigrations, type SettingsMigration } from './migrations';

describe('migrateSettings', () => {
  it('is the identity when the row is already at the target version', () => {
    const data = { a: 1 };
    expect(migrateSettings(data, 1, 1)).toBe(data);
  });

  it('applies forward migrations in order from the stored version up to the target', () => {
    const registry: Record<number, SettingsMigration> = {
      1: (d) => ({ ...(d as object), step1: true }),
      2: (d) => ({ ...(d as object), step2: true }),
    };
    expect(migrateSettings({ base: true }, 1, 3, registry)).toEqual({
      base: true,
      step1: true,
      step2: true,
    });
  });

  it('skips versions with no registered migration', () => {
    const registry: Record<number, SettingsMigration> = {
      2: (d) => ({ ...(d as object), step2: true }),
    };
    expect(migrateSettings({ base: true }, 1, 3, registry)).toEqual({ base: true, step2: true });
  });
});

describe('settingsMigrations registry (v1 baseline)', () => {
  it('is empty at the v1 baseline', () => {
    expect(Object.keys(settingsMigrations)).toEqual([]);
  });

  it('current version is 1', () => {
    expect(CURRENT_SETTINGS_VERSION).toBe(1);
  });

  it('a v1 row is migrated by the empty registry as a no-op', () => {
    const v1 = { connections: [], selectedModelId: '' };
    // fromVersion=1, toVersion defaults to CURRENT_SETTINGS_VERSION (1), registry defaults to settingsMigrations ({}).
    // The loop condition `v < toVersion` is `1 < 1`, false on entry, so the body never runs and the
    // same object reference is returned unchanged.
    expect(migrateSettings(v1, 1)).toBe(v1);
  });
});
