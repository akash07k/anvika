import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import { connectionTypeFor, parseModelId } from './connection-type';

const settings = SettingsSchema.parse({
  connections: [{ id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' }],
});

describe('parseModelId', () => {
  it('splits on the FIRST colon only', () => {
    expect(parseModelId('work:claude-3:beta')).toEqual({
      connectionId: 'work',
      model: 'claude-3:beta',
    });
  });
  it('returns null when there is no colon', () => {
    expect(parseModelId('bare')).toBeNull();
  });
});

describe('connectionTypeFor', () => {
  it('maps a connection id to its type', () => {
    expect(connectionTypeFor(settings, 'work')).toBe('anthropic');
  });
  it('returns null for an unknown id', () => {
    expect(connectionTypeFor(settings, 'nope')).toBeNull();
  });
});
