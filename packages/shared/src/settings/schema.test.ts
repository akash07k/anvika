import { describe, expect, it } from 'vitest';

import { DEFAULT_KEYMAP } from './keymap';
import { CURRENT_SETTINGS_VERSION, SettingsSchema } from './schema';

describe('SettingsSchema', () => {
  it('parses an empty object into the full defaults', () => {
    const s = SettingsSchema.parse({});
    expect(s.selectedModelId).toBe('');
    expect(s.announcementPeriodMs).toBe(2000);
    expect(s.readWholeOnComplete).toBe(false);
    expect(s.focusOnCompletion).toBe('keep');
    expect(s.sendKeyMode).toBe('modEnter');
    expect(s.quickNavSinglePressReads).toBe('descriptor');
    expect(s.quickNavDoublePressMs).toBe(500);
    expect(s.quickNavLengthCue).toBe('count-first');
    expect(s.quickNavPreviewWords).toBe(40);
    expect(s.hotkeyBindings).toEqual(DEFAULT_KEYMAP);
  });

  it('rejects an out-of-range announcement period and a bad enum', () => {
    expect(SettingsSchema.safeParse({ announcementPeriodMs: 10 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ sendKeyMode: 'nope' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ quickNavLengthCue: 'nope' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ quickNavPreviewWords: 4 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ quickNavPreviewWords: 201 }).success).toBe(false);
  });

  it('accepts the inclusive preview-length bounds (5 and 200)', () => {
    expect(SettingsSchema.safeParse({ quickNavPreviewWords: 5 }).success).toBe(true);
    expect(SettingsSchema.safeParse({ quickNavPreviewWords: 200 }).success).toBe(true);
  });
});

describe('SettingsSchema connections', () => {
  it('is at version 1 and defaults connections to an empty array', () => {
    expect(CURRENT_SETTINGS_VERSION).toBe(1);
    const parsed = SettingsSchema.parse({});
    expect(parsed.connections).toEqual([]);
    expect(parsed.selectedModelId).toBe('');
  });

  it('no longer carries providers or localBaseUrl', () => {
    const parsed = SettingsSchema.parse({}) as Record<string, unknown>;
    expect('providers' in parsed).toBe(false);
    expect('localBaseUrl' in parsed).toBe(false);
  });

  it('validates a connection inside settings', () => {
    const parsed = SettingsSchema.parse({
      connections: [{ id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' }],
    });
    expect(parsed.connections[0]?.id).toBe('work');
  });
});

describe('currency settings', () => {
  it('defaults currency to USD and inrPerUsd to 95.11', () => {
    const s = SettingsSchema.parse({});
    expect(s.currency).toBe('USD');
    expect(s.inrPerUsd).toBe(95.11);
  });

  it('accepts INR and a custom positive rate', () => {
    const s = SettingsSchema.parse({ currency: 'INR', inrPerUsd: 83.5 });
    expect(s.currency).toBe('INR');
    expect(s.inrPerUsd).toBe(83.5);
  });

  it('rejects a non-positive rate, an over-bound rate, and an unknown currency', () => {
    expect(() => SettingsSchema.parse({ inrPerUsd: 0 })).toThrow();
    expect(() => SettingsSchema.parse({ inrPerUsd: 100001 })).toThrow();
    expect(() => SettingsSchema.parse({ currency: 'EUR' })).toThrow();
  });

  it('is at schema version 1', () => {
    expect(CURRENT_SETTINGS_VERSION).toBe(1);
  });
});

describe('FX auto-refresh settings', () => {
  it('defaults autoRefreshFxRate to false and inrPerUsdUpdatedAt to null', () => {
    const s = SettingsSchema.parse({});
    expect(s.autoRefreshFxRate).toBe(false);
    expect(s.inrPerUsdUpdatedAt).toBeNull();
  });

  it('accepts a boolean toggle and an epoch-ms timestamp', () => {
    const s = SettingsSchema.parse({
      autoRefreshFxRate: true,
      inrPerUsdUpdatedAt: 1_700_000_000_000,
    });
    expect(s.autoRefreshFxRate).toBe(true);
    expect(s.inrPerUsdUpdatedAt).toBe(1_700_000_000_000);
  });

  it('rejects a negative or non-integer timestamp', () => {
    expect(() => SettingsSchema.parse({ inrPerUsdUpdatedAt: -1 })).toThrow();
    expect(() => SettingsSchema.parse({ inrPerUsdUpdatedAt: 1.5 })).toThrow();
  });

  it('is at schema version 1', () => {
    expect(CURRENT_SETTINGS_VERSION).toBe(1);
  });
});

describe('keymap backfill regression', () => {
  it('parses settings with a partial keymap, backfilling the open-shortcuts action', () => {
    const s = SettingsSchema.parse({ hotkeyBindings: { send: 'alt+s' } });
    expect(s.hotkeyBindings.send).toBe('alt+s');
    expect(s.hotkeyBindings.openKeyboardShortcuts).toBe('alt+slash');
  });
});

describe('timestamp format settings', () => {
  it("defaults reproduce today's exact output (weekday on, day-first, 12h, seconds)", () => {
    const s = SettingsSchema.parse({});
    expect(s.timestampWeekday).toBe(true);
    expect(s.timestampDateStyle).toBe('day-first');
    expect(s.timestampHourCycle).toBe('h12');
    expect(s.timestampSeconds).toBe(true);
  });

  it('accepts each customized value', () => {
    const s = SettingsSchema.parse({
      timestampWeekday: false,
      timestampDateStyle: 'month-first',
      timestampHourCycle: 'h24',
      timestampSeconds: false,
    });
    expect(s.timestampWeekday).toBe(false);
    expect(s.timestampDateStyle).toBe('month-first');
    expect(s.timestampHourCycle).toBe('h24');
    expect(s.timestampSeconds).toBe(false);
  });

  it('rejects an unknown date style or hour cycle', () => {
    expect(SettingsSchema.safeParse({ timestampDateStyle: 'iso' }).success).toBe(false);
    expect(SettingsSchema.safeParse({ timestampHourCycle: 'h25' }).success).toBe(false);
  });

  it('is at schema version 1', () => {
    expect(CURRENT_SETTINGS_VERSION).toBe(1);
  });
});
