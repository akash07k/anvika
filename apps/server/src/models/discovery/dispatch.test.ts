import { describe, expect, it } from 'vitest';

import { discoverModels } from './dispatch';

const fetchImpl = async () =>
  new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b' }] }), { status: 200 });

describe('discoverModels', () => {
  it('dispatches to the openai-compatible adapter and returns bare-id DiscoveredModels', async () => {
    const models = await discoverModels(
      {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        reasoningEffort: 'inherit',
        enabled: true,
        baseUrl: 'https://api.venice.ai/api/v1',
        sendThinkingParams: true,
      },
      { fetchImpl },
    );
    expect(models).toEqual([{ id: 'llama-3.3-70b' }]);
  });

  it('returns [] for azure (no data-plane listing)', async () => {
    const models = await discoverModels(
      {
        id: 'az',
        label: 'Az',
        type: 'azure',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
        resourceName: 'r',
      },
      {},
    );
    expect(models).toEqual([]);
  });
});
