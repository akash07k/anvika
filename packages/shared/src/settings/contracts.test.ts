import { describe, expect, it } from 'vitest';

import { redactSecrets } from './redact';
import { SettingsSchema } from './schema';
import { SettingsPatchSchema, SettingsResponseSchema } from './contracts';

/** A complete, valid redacted settings object (the response `settings` is now fully validated). */
const settings = redactSecrets(SettingsSchema.parse({}));

describe('settings contracts', () => {
  it('SettingsResponseSchema validates the { version, settings } envelope', () => {
    const ok = SettingsResponseSchema.safeParse({ version: 1, settings });
    expect(ok.success).toBe(true);
    // A bare settings object (no version, partial settings) is rejected by the strict schema.
    expect(SettingsResponseSchema.safeParse({ settings: {} }).success).toBe(false);
  });

  it('parses the response envelope with recovered and paths', () => {
    const r = SettingsResponseSchema.parse({
      version: 1,
      settings,
      recovered: false,
      paths: { settings: '/d/settings.json', secrets: '/d/secrets.json' },
    });
    expect(r.recovered).toBe(false);
    expect(r.paths?.secrets).toContain('secrets.json');
  });

  it('defaults recovered to false and leaves paths optional (tolerant of legacy mocks)', () => {
    const r = SettingsResponseSchema.parse({ version: 1, settings });
    expect(r.recovered).toBe(false);
    expect(r.paths).toBeUndefined();
  });

  it('SettingsPatchSchema accepts an arbitrary object and PRESERVES its keys (looseObject)', () => {
    const parsed = SettingsPatchSchema.safeParse({ providers: { anthropic: { apiKey: 'x' } } });
    expect(parsed.success).toBe(true);
    // Must not strip unknown keys - the merge depends on them surviving.
    expect(parsed.success && parsed.data).toEqual({ providers: { anthropic: { apiKey: 'x' } } });
  });

  it('SettingsPatchSchema rejects non-objects', () => {
    expect(SettingsPatchSchema.safeParse(42).success).toBe(false);
    expect(SettingsPatchSchema.safeParse(null).success).toBe(false);
  });
});
