import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import * as apiClient from '../../lib/api-client';
import { useDraftStore } from '../../stores/draftStore';
import { useAdvancedNewConversation } from './useAdvancedNewConversation';

const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

const reportClientErrorMock = vi.fn();
vi.mock('../../diagnostics/reportClientError', () => ({
  reportClientError: (...args: unknown[]) => reportClientErrorMock(...args),
}));

let listData: { conversations: Array<{ id: string }> } | undefined = { conversations: [] };
vi.mock('../../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../../lib/conversation/conversationQueries')>(
    '../../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationList: () => ({ data: listData }),
  };
});

let patchSpy: ReturnType<typeof vi.spyOn>;
const events: NotificationEvent[] = [];
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
  listData = { conversations: [] };
  events.length = 0;
  navigateMock.mockClear();
  reportClientErrorMock.mockClear();
  registerChannel((e) => events.push(e));
  useDraftStore.getState().clearDraft();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useAdvancedNewConversation', () => {
  it('create with title + model mints a draft, seeds draftTitle/draftModel, navigates, notifies', () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: 'Plan', model: 'openai:gpt-4o' }));

    const { draftId, draftTitle, draftModelId } = useDraftStore.getState();
    expect(draftId).not.toBeNull();
    expect(draftTitle).toBe('Plan');
    expect(draftModelId).toBe('openai:gpt-4o');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: draftId },
    });
    expect(events).toContainEqual({ type: 'conversationCreated' });
  });

  it('create with title + model persists: patches model endpoint THEN rename endpoint', async () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: 'Plan', model: 'openai:gpt-4o' }));

    const { draftId } = useDraftStore.getState();
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${draftId}/model`, {
        modelId: 'openai:gpt-4o',
      });
      expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${draftId}`, {
        title: 'Plan',
      });
    });
    // Order: model THEN rename.
    const calls = patchSpy.mock.calls.map((c: Parameters<typeof patchSpy>[0][]) => c[0] as string);
    const modelIdx = calls.findIndex((url: string) => url.endsWith('/model'));
    const renameIdx = calls.findIndex((url: string) => !url.endsWith('/model'));
    expect(modelIdx).toBeLessThan(renameIdx);
  });

  it('create with empty title + null model does NOT call apiPatchNoContent (pure draft)', async () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: '', model: null }));
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('create with only a model (no title) patches model but not rename', async () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: '', model: 'anthropic:claude-3-5-sonnet-20241022' }));

    const { draftId } = useDraftStore.getState();
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${draftId}/model`, {
        modelId: 'anthropic:claude-3-5-sonnet-20241022',
      });
    });
    const renameCalls = patchSpy.mock.calls.filter(
      (c: Parameters<typeof patchSpy>[0][]) => !(c[0] as string).endsWith('/model'),
    );
    expect(renameCalls).toHaveLength(0);
  });

  it('create with only a title (null model) patches model (null) and rename', async () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: 'My Chat', model: null }));

    const { draftId } = useDraftStore.getState();
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${draftId}/model`, {
        modelId: null,
      });
      expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${draftId}`, {
        title: 'My Chat',
      });
    });
  });

  it('persist failure is swallowed (non-fatal) but emits a content-safe diagnostic', async () => {
    patchSpy.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: 'Oops', model: 'openai:gpt-4o' }));
    await new Promise<void>((r) => setTimeout(r, 20));
    // Non-fatal: the draft store still shows the choice (no throw)...
    expect(useDraftStore.getState().draftTitle).toBe('Oops');
    // ...but the failed durable persist must not be swallowed silently - it logs a client diagnostic.
    expect(reportClientErrorMock).toHaveBeenCalled();
  });

  it('title whitespace is trimmed: leading/trailing spaces not persisted as title', async () => {
    const { result } = renderHook(() => useAdvancedNewConversation(), { wrapper });
    act(() => result.current.create({ title: '   ', model: null }));
    await new Promise<void>((r) => setTimeout(r, 10));
    // Whitespace-only title treated as no title - no persist.
    expect(patchSpy).not.toHaveBeenCalled();
    expect(useDraftStore.getState().draftTitle).toBeNull();
  });
});
