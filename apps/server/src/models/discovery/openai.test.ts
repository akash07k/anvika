import { describe, expect, it } from 'vitest';

import { discoverOpenAiModelIds } from './openai';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const errorFetchImpl = async () => new Response('nope', { status: 500 });

describe('discoverOpenAiModelIds', () => {
  it('keeps only chat-family ids via the allowlist', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [{ id: 'gpt-4o' }, { id: 'text-embedding-3-small' }, { id: 'o3-mini' }],
      });
    const ids = await discoverOpenAiModelIds(
      {
        id: 'o',
        label: 'O',
        type: 'openai',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    expect(ids).toEqual(['gpt-4o', 'o3-mini']);
  });

  it('drops gpt-prefixed non-chat models (image/audio/realtime/transcribe) via the denylist', async () => {
    const fetchImpl = async () =>
      jsonResponse({
        data: [
          { id: 'gpt-4o' },
          { id: 'gpt-image-1' },
          { id: 'gpt-4o-audio-preview' },
          { id: 'gpt-4o-realtime-preview' },
          { id: 'gpt-4o-transcribe' },
          { id: 'gpt-4o-mini-tts' },
        ],
      });
    const ids = await discoverOpenAiModelIds(
      {
        id: 'o',
        label: 'O',
        type: 'openai',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      },
      { fetchImpl },
    );
    // Only the genuine chat model survives; every non-chat gpt-* id is dropped.
    expect(ids).toEqual(['gpt-4o']);
  });

  it('returns [] on a non-200 or bad shape (fail-soft)', async () => {
    expect(
      await discoverOpenAiModelIds(
        {
          id: 'o',
          label: 'O',
          type: 'openai',
          reasoningEffort: 'inherit',
          enabled: true,
          apiKey: 'k',
        },
        { fetchImpl: errorFetchImpl },
      ),
    ).toEqual([]);
  });
});
