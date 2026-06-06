import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import { priceForModelId } from './price';

const settings = SettingsSchema.parse({
  connections: [
    { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' },
    {
      id: 'venice',
      label: 'Venice',
      type: 'openai-compatible',
      baseUrl: 'https://api.venice.ai/api/v1',
    },
  ],
});

describe('priceForModelId (connection-keyed)', () => {
  it('prices a catalog model by mapping connectionId -> type', () => {
    const price = priceForModelId('work:claude-haiku-4-5', settings);
    expect(price?.currency).toBe('USD');
    expect(typeof price?.input).toBe('number');
  });

  it('returns null for an unknown connection prefix', () => {
    expect(priceForModelId('ghost:model', settings)).toBeNull();
  });

  it('returns null for an openai-compatible model with no catalog entry', () => {
    expect(priceForModelId('venice:llama-3.3-70b', settings)).toBeNull();
  });
});
