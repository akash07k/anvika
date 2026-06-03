import { afterEach, describe, expect, it, vi } from 'vitest';

import { useRuntimeConfigStore } from '../stores/runtimeConfigStore';
import { loadRuntimeConfig } from './loadRuntimeConfig';

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  useRuntimeConfigStore.setState({ logContent: false });
});

describe('loadRuntimeConfig', () => {
  it('populates logContent from the health response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      reply({ status: 'ok', version: '1.0.0', logContent: true }),
    );
    await loadRuntimeConfig();
    expect(useRuntimeConfigStore.getState().logContent).toBe(true);
  });

  it('leaves the safe default on a failed fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    await loadRuntimeConfig();
    expect(useRuntimeConfigStore.getState().logContent).toBe(false);
  });
});
