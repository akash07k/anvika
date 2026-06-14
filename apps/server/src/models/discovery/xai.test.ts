import { describe, expect, it } from 'vitest';

import { discoverXaiModels } from './xai';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const errorFetchImpl = async () => new Response('nope', { status: 500 });
const throwingFetchImpl = async (): Promise<Response> => {
  throw new Error('fetch must not run for a keyless connection');
};

describe('discoverXaiModels', () => {
  it('keeps text-output models and returns their bare ids (no meta: units unconfirmed)', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        models: [
          { id: 'grok-4', output_modalities: ['text', 'image'] },
          { id: 'grok-image', output_modalities: ['image'] },
        ],
      });
    const models = await discoverXaiModels(
      { id: 'x', label: 'X', type: 'xai', reasoningEffort: 'inherit', enabled: true, apiKey: 'k' },
      { fetchImpl },
    );
    expect(models).toEqual([{ id: 'grok-4' }]);
  });

  it('returns [] on a non-200 or bad shape (fail-soft)', async () => {
    expect(
      await discoverXaiModels(
        {
          id: 'x',
          label: 'X',
          type: 'xai',
          reasoningEffort: 'inherit',
          enabled: true,
          apiKey: 'k',
        },
        { fetchImpl: errorFetchImpl },
      ),
    ).toEqual([]);
  });

  it('returns [] without fetching when the connection carries no apiKey', async () => {
    const models = await discoverXaiModels(
      { id: 'x', label: 'X', type: 'xai', reasoningEffort: 'inherit', enabled: true },
      { fetchImpl: throwingFetchImpl },
    );
    expect(models).toEqual([]);
  });
});
