import { describe, expect, it } from 'vitest';

import { SettingsSchema } from './schema';

describe('display-name settings fields', () => {
  it('defaults to You and Assistant when absent', () => {
    const s = SettingsSchema.parse({});
    expect(s.userName).toBe('You');
    expect(s.assistantName).toBe('Assistant');
  });

  it('trims surrounding whitespace', () => {
    const s = SettingsSchema.parse({ userName: '  Akash  ', assistantName: '  Claude ' });
    expect(s.userName).toBe('Akash');
    expect(s.assistantName).toBe('Claude');
  });

  it('keeps an explicit value', () => {
    const s = SettingsSchema.parse({ userName: 'Me', assistantName: 'Bot' });
    expect(s.userName).toBe('Me');
    expect(s.assistantName).toBe('Bot');
  });

  it('allows an empty value (the render layer falls back to the default)', () => {
    const s = SettingsSchema.parse({ userName: '', assistantName: '' });
    expect(s.userName).toBe('');
    expect(s.assistantName).toBe('');
  });

  it('rejects a value longer than 40 characters', () => {
    const tooLong = 'x'.repeat(41);
    expect(SettingsSchema.safeParse({ userName: tooLong }).success).toBe(false);
    expect(SettingsSchema.safeParse({ assistantName: tooLong }).success).toBe(false);
  });

  it('accepts a value of exactly 40 characters', () => {
    const exactly40 = 'x'.repeat(40);
    expect(SettingsSchema.safeParse({ userName: exactly40 }).success).toBe(true);
    expect(SettingsSchema.safeParse({ assistantName: exactly40 }).success).toBe(true);
  });
});
