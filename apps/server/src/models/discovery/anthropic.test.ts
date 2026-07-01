import { describe, expect, it } from 'vitest';

import { discoverAnthropicModelIds } from './anthropic';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const errorFetchImpl = async () => new Response('nope', { status: 500 });

describe('discoverAnthropicModelIds', () => {
  it('returns the bare ids from the data array', async () => {
    const fetchImpl = async () =>
      jsonResponse({ data: [{ id: 'claude-haiku-4-5' }, { id: 'claude-opus-4-6' }] });
    const ids = await discoverAnthropicModelIds(
      {
        id: 'a',
        label: 'A',
        type: 'anthropic',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(ids).toEqual(['claude-haiku-4-5', 'claude-opus-4-6']);
  });

  it('returns [] on a non-200 or bad shape (fail-soft)', async () => {
    expect(
      await discoverAnthropicModelIds(
        {
          id: 'a',
          label: 'A',
          type: 'anthropic',
          reasoningEffort: 'inherit',
          enabled: true,
          apiKey: 'k',
        },
        { fetchImpl: errorFetchImpl },
      ),
    ).toEqual([]);
  });

  it('returns [] without fetching when no apiKey is set', async () => {
    expect(
      await discoverAnthropicModelIds({
        id: 'a',
        label: 'A',
        type: 'anthropic',
        reasoningEffort: 'inherit',
        enabled: true,
      }),
    ).toEqual([]);
  });
});
