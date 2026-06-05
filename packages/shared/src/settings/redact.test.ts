// packages/shared/src/settings/redact.test.ts
import { describe, expect, it } from 'vitest';

import { redactSecrets } from './redact';
import { SettingsSchema } from './schema';

describe('redactSecrets (connections)', () => {
  it('replaces apiKey and header values with { isSet }, keeps non-secret fields', () => {
    const settings = SettingsSchema.parse({
      connections: [
        { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' },
        {
          id: 'venice',
          label: 'Venice',
          type: 'openai-compatible',
          baseUrl: 'https://api.venice.ai/api/v1',
          headers: { 'x-extra': 'v' },
        },
      ],
    });
    const redacted = redactSecrets(settings);
    expect(redacted.connections[0]).toMatchObject({ id: 'work', apiKey: { isSet: true } });
    expect(redacted.connections[1]).toMatchObject({
      id: 'venice',
      baseUrl: 'https://api.venice.ai/api/v1',
      headers: { 'x-extra': { isSet: true } },
      apiKey: { isSet: false },
    });
  });
});
