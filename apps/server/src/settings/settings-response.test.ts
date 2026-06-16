import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import { buildSettingsResponse } from './settings-response';

describe('buildSettingsResponse', () => {
  it('redacts a connection secret to { isSet } and never returns the plaintext key', () => {
    const settings = SettingsSchema.parse({
      connections: [{ id: 'a', type: 'anthropic', label: 'A', apiKey: 'sk-secret' }],
    });
    const out = buildSettingsResponse({ version: 7, settings, recovered: false });
    const connection = out.settings.connections[0];
    expect(connection?.apiKey).toEqual({ isSet: true });
    // The plaintext secret must never appear anywhere in the response envelope.
    expect(JSON.stringify(out)).not.toContain('sk-secret');
  });

  it('omits paths when none are given and includes them when provided', () => {
    const settings = SettingsSchema.parse({});
    expect(buildSettingsResponse({ version: 7, settings, recovered: false }).paths).toBeUndefined();
    const paths = { settings: '/d/settings.json', secrets: '/d/secrets.json' };
    expect(buildSettingsResponse({ version: 7, settings, recovered: true, paths }).paths).toEqual(
      paths,
    );
  });
});
