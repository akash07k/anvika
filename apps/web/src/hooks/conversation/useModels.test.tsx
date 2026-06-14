import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModelsResponse } from '@anvika/shared/models/contracts';

import { useConnectionStatuses, useModels } from './useModels';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const RESPONSE: ModelsResponse = {
  models: [
    {
      id: 'anthropic:claude-x',
      providerId: 'anthropic',
      connectionId: 'anthropic',
      connectionLabel: 'Anthropic',
      displayName: 'Claude X',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputPrice: 3,
      outputPrice: 15,
      capabilities: { text: true, reasoning: false },
    },
  ],
  connectionStatuses: [{ connectionId: 'local', outcome: 'ok' }],
  priceCurrency: 'USD',
  priceUnit: 'perMillionTokens',
};

/**
 * Build a wrapper backed by a SINGLE shared QueryClient. Both hooks must mount under the same client
 * for the "one fetch" dedup assertion to be meaningful.
 */
function sharedWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useConnectionStatuses + useModels (shared cache)', () => {
  it('returns statuses from one shared fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const shared = sharedWrapper();
    const models = renderHook(() => useModels(), { wrapper: shared });
    const statuses = renderHook(() => useConnectionStatuses(), { wrapper: shared });

    await waitFor(() => expect(models.result.current.data).toHaveLength(1));
    await waitFor(() =>
      expect(statuses.result.current.data).toEqual([{ connectionId: 'local', outcome: 'ok' }]),
    );
    // Both hooks share ['models'] key - only one network fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useModels', () => {
  it('GETs /api/v1/models and returns the validated model list', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const { result } = renderHook(() => useModels(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(RESPONSE.models);
    expect(fetchSpy).toHaveBeenCalledWith('/api/v1/models', expect.objectContaining({}));
  });

  it('surfaces an empty list without error when no provider is configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ models: [], priceCurrency: 'USD', priceUnit: 'perMillionTokens' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const { result } = renderHook(() => useModels(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
