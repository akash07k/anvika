import { describe, expect, it } from 'vitest';

import { SettingsSchema, type Settings } from '@anvika/shared/settings/schema';

import { mergeSettingsPatch } from './merge';

function base(): Settings {
  return SettingsSchema.parse({
    connections: [
      { id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'an' },
      { id: 'openai', label: 'OpenAI', type: 'openai', apiKey: 'oi' },
    ],
  });
}

describe('mergeSettingsPatch', () => {
  it('replaces a present top-level scalar and keeps omitted fields', () => {
    const merged = SettingsSchema.parse(mergeSettingsPatch(base(), { announcementPeriodMs: 3000 }));
    expect(merged.announcementPeriodMs).toBe(3000);
    expect(merged.quickNavDoublePressMs).toBe(500);
  });

  it('replaces the whole connections array when provided', () => {
    const merged = SettingsSchema.parse(
      mergeSettingsPatch(base(), {
        connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'NEW' }],
      }),
    );
    expect(merged.connections).toHaveLength(1);
    expect(merged.connections[0]?.apiKey).toBe('NEW');
  });

  it('keeps the existing connections when the patch omits connections', () => {
    const merged = SettingsSchema.parse(mergeSettingsPatch(base(), { announcementPeriodMs: 2500 }));
    expect(merged.connections).toHaveLength(2);
    expect(merged.connections[0]?.id).toBe('anthropic');
  });

  it('clears all connections when the patch supplies an empty array', () => {
    const merged = SettingsSchema.parse(mergeSettingsPatch(base(), { connections: [] }));
    expect(merged.connections).toEqual([]);
  });

  it('merges hotkey bindings per-action', () => {
    const merged = SettingsSchema.parse(
      mergeSettingsPatch(base(), { hotkeyBindings: { send: 'ctrl+s' } }),
    );
    expect(merged.hotkeyBindings.send).toBe('ctrl+s');
    expect(merged.hotkeyBindings.stop).toBe('shift+escape');
  });

  it('produces an object that fails validation for a bad value (caller re-validates)', () => {
    const merged = mergeSettingsPatch(base(), { announcementPeriodMs: 5 });
    expect(SettingsSchema.safeParse(merged).success).toBe(false);
  });
});
