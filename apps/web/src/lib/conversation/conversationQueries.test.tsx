import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  conversationDetailKey,
  conversationListQuery,
  conversationsListKey,
  useConversationDetail,
  useConversationList,
} from './conversationQueries';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ID_A = 'xyz-789';

describe('query keys', () => {
  it('exposes a stable list key and an id-scoped detail key', () => {
    expect(conversationsListKey).toEqual(['conversations']);
    expect(conversationDetailKey(ID_A)).toEqual(['conversation', ID_A]);
  });
});

describe('conversationListQuery / useConversationList', () => {
  it('loads the conversation list and activeId from GET /api/v1/conversations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        conversations: [{ id: ID_A, title: 'First', updatedAt: 1, pinnedAt: null, revision: 3 }],
        activeId: ID_A,
      }),
    );
    const { result } = renderHook(() => useConversationList(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.activeId).toBe(ID_A);
    expect(result.current.data?.conversations).toHaveLength(1);
    expect(result.current.data?.conversations[0]?.revision).toBe(3);
  });

  it('uses the shared list key in its options', () => {
    expect(conversationListQuery.queryKey).toEqual(conversationsListKey);
  });

  it('has staleTime Infinity so list observers do not trigger background refetches', () => {
    expect(conversationListQuery.staleTime).toBe(Infinity);
  });

  it('rejects a malformed list body (summary missing revision) with validation-error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        conversations: [{ id: ID_A, title: 'First', updatedAt: 1 }],
        activeId: null,
      }),
    );
    const { result } = renderHook(() => useConversationList(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'validation-error' });
  });
});

describe('useConversationDetail', () => {
  it('loads a single conversation detail by id, surfacing revision', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        messages: [{ id: 'u1', role: 'user', parts: [] }],
        reasoningOverride: 'high',
        modelId: null,
        title: 'First',
        revision: 7,
      }),
    );
    const { result } = renderHook(() => useConversationDetail(ID_A), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.title).toBe('First');
    expect(result.current.data?.revision).toBe(7);
    expect(result.current.data?.reasoningOverride).toBe('high');
    expect(result.current.data?.messages).toHaveLength(1);
  });

  it('resolves a not-found (404) draft to a success with data null, not an error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ code: 'not-found', message: 'No such conversation', details: null }, 404),
    );
    const { result } = renderHook(() => useConversationDetail(ID_A), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('rejects a malformed detail body (missing revision) with validation-error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        messages: [],
        reasoningOverride: null,
        title: 'First',
      }),
    );
    const { result } = renderHook(() => useConversationDetail(ID_A), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'validation-error' });
  });

  it('does NOT fire a fetch when id is undefined', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useConversationDetail(undefined), { wrapper });
    // The query is disabled: it must never reach fetching or success state.
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire a fetch when id is an empty string', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useConversationDetail(''), { wrapper });
    expect(result.current.isFetching).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
