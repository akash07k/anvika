import { expect, it, vi } from 'vitest';

import { chatFetch } from './chatFetch';

it('throws a typed ApiClientError carrying the server code for a canonical error response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'unconfigured',
          message: 'No model is selected. Choose a model in Settings.',
        }),
        { status: 503, headers: { 'content-type': 'application/json' } },
      ),
    ),
  );
  await expect(chatFetch('/api/v1/chat', { method: 'POST' })).rejects.toMatchObject({
    name: 'ApiClientError',
    code: 'unconfigured',
  });
  vi.unstubAllGlobals();
});

it('returns the response unchanged when ok', async () => {
  const ok = new Response('data', { status: 200 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok));
  await expect(chatFetch('/api/v1/chat')).resolves.toBe(ok);
  vi.unstubAllGlobals();
});
