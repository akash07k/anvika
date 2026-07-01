import { describe, expect, it } from 'vitest';

import { discoverGoogleModelIds } from './google';

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

describe('discoverGoogleModelIds', () => {
  it('keeps generateContent models, strips the models/ prefix', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        models: [
          { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      });
    const ids = await discoverGoogleModelIds(
      {
        id: 'g',
        label: 'G',
        type: 'google',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(ids).toEqual(['gemini-2.5-pro']);
  });

  it('returns [] on a non-200 or bad shape (fail-soft)', async () => {
    expect(
      await discoverGoogleModelIds(
        {
          id: 'g',
          label: 'G',
          type: 'google',
          reasoningEffort: 'inherit',
          enabled: true,
          apiKey: 'k',
        },
        { fetchImpl: errorFetchImpl },
      ),
    ).toEqual([]);
  });

  it('returns [] without fetching when the connection carries no apiKey', async () => {
    const ids = await discoverGoogleModelIds(
      { id: 'g', label: 'G', type: 'google', reasoningEffort: 'inherit', enabled: true },
      { fetchImpl: throwingFetchImpl },
    );
    expect(ids).toEqual([]);
  });
});
