import { describe, expect, it } from 'vitest';

import { discoverOpenAiCompatibleModelIds } from './openai-compatible';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const notFoundFetchImpl = async () => new Response('not found', { status: 404 });

describe('discoverOpenAiCompatibleModelIds', () => {
  it('returns the bare ids and forwards custom headers and the bearer key', async () => {
    let sentHeaders: Record<string, string> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      sentHeaders = (init.headers ?? {}) as Record<string, string>;
      return jsonResponse({ data: [{ id: 'llama-3.3-70b' }] });
    };
    const ids = await discoverOpenAiCompatibleModelIds(
      {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        reasoningEffort: 'inherit',
        enabled: true,
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'k',
        headers: { 'X-Custom': 'v' },
        sendThinkingParams: true,
      },
      { fetchImpl },
    );
    expect(ids).toEqual(['llama-3.3-70b']);
    expect(sentHeaders['X-Custom']).toBe('v');
    expect(sentHeaders.Authorization).toBe('Bearer k');
  });

  it('returns [] on a 404/empty body (no listing)', async () => {
    expect(
      await discoverOpenAiCompatibleModelIds(
        {
          id: 'venice',
          label: 'Venice',
          type: 'openai-compatible',
          reasoningEffort: 'inherit',
          enabled: true,
          baseUrl: 'http://localhost:1234/v1',
          sendThinkingParams: true,
        },
        { fetchImpl: notFoundFetchImpl },
      ),
    ).toEqual([]);
  });
});
