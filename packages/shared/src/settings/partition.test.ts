// packages/shared/src/settings/partition.test.ts
import { describe, expect, it } from 'vitest';

import { mergeSecrets, partitionSecrets } from './partition';
import { SettingsSchema } from './schema';

const settings = SettingsSchema.parse({
  connections: [
    { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk-secret' },
    {
      id: 'venice',
      label: 'Venice',
      type: 'openai-compatible',
      baseUrl: 'https://api.venice.ai/api/v1',
      apiKey: 'venice-key',
      headers: { 'x-extra': 'header-secret' },
    },
  ],
});

describe('partitionSecrets (connections)', () => {
  it('moves apiKey and header values into secrets, leaving public values stripped', () => {
    const { public: pub, secrets } = partitionSecrets(settings);
    const pubConns = (pub as { connections: Record<string, unknown>[] }).connections;
    const firstConn = pubConns[0];
    expect(firstConn !== undefined && 'apiKey' in firstConn).toBe(false);
    expect((pubConns[1] as { headers?: unknown }).headers).toBeUndefined();
    expect((pubConns[1] as { baseUrl?: unknown }).baseUrl).toBe('https://api.venice.ai/api/v1');
    expect(secrets).toEqual({
      connections: {
        work: { apiKey: 'sk-secret' },
        venice: { apiKey: 'venice-key', headers: { 'x-extra': 'header-secret' } },
      },
    });
  });

  it('round-trips through mergeSecrets', () => {
    const { public: pub, secrets } = partitionSecrets(settings);
    const merged = mergeSecrets(pub, secrets);
    expect(SettingsSchema.parse(merged)).toEqual(settings);
  });
});
