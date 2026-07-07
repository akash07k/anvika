import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

import * as apiClient from '../../lib/api-client';
import {
  conversationDetailKey,
  conversationsListKey,
} from '../../lib/conversation/conversationQueries';
import { useDraftStore } from '../../stores/draftStore';
import { useConversationModel } from './useConversationModel';

const ID = 'xyz-789';

// Use vi.spyOn (not vi.mock) on api-client to avoid a vitest jsdom teardown hang with never-settling
// Promise factories (same pattern as modelOverrideWriter.test.ts / useConversationReasoning.test.tsx).
let patchSpy: ReturnType<typeof vi.spyOn>;

// Mutable stubs for the detail query so each test drives its return value. `hasDetailData` toggles a
// real row (object) versus a not-found draft (null), mirroring useConversationDetail's real contract.
let detailModelId: string | null = null;
let hasDetailData = false;

vi.mock('../../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../../lib/conversation/conversationQueries')>(
    '../../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationDetail: () => ({
      // A not-found draft resolves to null (success), not undefined - same as the real hook.
      data: hasDetailData
        ? ({ messages: [], reasoningOverride: null, modelId: detailModelId } as {
            messages: unknown[];
            reasoningOverride: string | null;
            modelId: string | null;
          } | null)
        : null,
    }),
  };
});

const events: NotificationEvent[] = [];
let queryClient: QueryClient;

/** Render the hook under a fresh retry-off QueryClient, returning the client too. */
function render(id: string | undefined) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useConversationModel(id), { wrapper });
}

beforeEach(() => {
  patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
  detailModelId = null;
  hasDetailData = false;
  events.length = 0;
  registerChannel((e) => events.push(e));
  useDraftStore.setState({
    draftId: null,
    draftReasoningOverride: null,
    draftModelId: null,
    draftTitle: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useConversationModel', () => {
  it('seeds modelId from the id-scoped conversation detail when the row exists', () => {
    hasDetailData = true;
    detailModelId = 'anthropic:claude';
    const { result } = render(ID);
    expect(result.current.modelId).toBe('anthropic:claude');
  });

  it('seeds modelId from the draft store for an unsaved draft (no row)', () => {
    // A draft id has no persisted row (detail resolves to null); the dialog's pre-selected model lives
    // in the draft store and must show in the header.
    hasDetailData = false;
    useDraftStore.setState({ draftId: ID, draftModelId: 'openai:gpt-4o' });
    const { result } = render(ID);
    expect(result.current.modelId).toBe('openai:gpt-4o');
  });

  it('does NOT seed from the draft store when this id is not the active draft (stale draftModelId guard)', () => {
    hasDetailData = false; // no persisted row
    useDraftStore.setState({ draftId: 'some-other-draft', draftModelId: 'openai:gpt-4o' });
    const { result } = render(ID);
    // A leftover draftModelId from a different draft must not leak into this conversation.
    expect(result.current.modelId).toBeNull();
  });

  it('seeds modelId to null (inherit) when neither a row nor a draft value exists', () => {
    hasDetailData = false;
    const { result } = render(ID);
    expect(result.current.modelId).toBeNull();
  });

  it('onModelChange sets modelId optimistically and PATCHes the id-scoped endpoint with the model', () => {
    const { result } = render(ID);
    act(() => void result.current.onModelChange('openai:gpt-4o'));
    expect(result.current.modelId).toBe('openai:gpt-4o');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/model`, {
      modelId: 'openai:gpt-4o',
    });
  });

  it('onModelChange with null PATCHes the id-scoped endpoint with null (inherit)', () => {
    const { result } = render(ID);
    act(() => void result.current.onModelChange(null));
    expect(result.current.modelId).toBeNull();
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/model`, { modelId: null });
  });

  it('on a draft, onModelChange also syncs the draft store so the choice survives until the first turn', () => {
    hasDetailData = false; // draft, no row
    useDraftStore.setState({ draftId: ID }); // this id IS the active draft
    const { result } = render(ID);
    act(() => void result.current.onModelChange('openai:gpt-4o'));
    expect(useDraftStore.getState().draftModelId).toBe('openai:gpt-4o');
  });

  it('on a successful write invalidates the id-scoped detail and the list', async () => {
    const { result } = render(ID);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => void result.current.onModelChange('anthropic:claude'));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(ID) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
    });
  });

  it('notifies modelOverrideSaveFailed when the write rejects', async () => {
    patchSpy.mockRejectedValue(new Error('network error'));
    const { result } = render(ID);
    act(() => void result.current.onModelChange('openai:gpt-4o'));
    await waitFor(() => {
      expect(events).toContainEqual({ type: 'modelOverrideSaveFailed' });
    });
  });

  it('onModelChange resolves true on a successful write (so the caller announces success only then)', async () => {
    const { result } = render(ID);
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.onModelChange('openai:gpt-4o');
    });
    expect(outcome).toBe(true);
  });

  it('onModelChange resolves false when the write rejects (and announces its own failure, not success)', async () => {
    patchSpy.mockRejectedValue(new Error('network error'));
    const { result } = render(ID);
    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.onModelChange('openai:gpt-4o');
    });
    expect(outcome).toBe(false);
    // The hook owns the failure announcement; the caller must NOT also announce success.
    expect(events).toContainEqual({ type: 'modelOverrideSaveFailed' });
    expect(events.some((e) => e.type === 'conversationModelChanged')).toBe(false);
  });

  it('rolls back the optimistic selection to the persisted value when the write rejects', async () => {
    hasDetailData = true;
    detailModelId = 'anthropic:claude'; // the persisted override before the failed change
    patchSpy.mockRejectedValue(new Error('network error'));
    const { result } = render(ID);
    expect(result.current.modelId).toBe('anthropic:claude');
    await act(async () => {
      await result.current.onModelChange('openai:gpt-4o');
    });
    // A failed write must not strand the control (or the transport ref) on the unpersisted choice.
    expect(result.current.modelId).toBe('anthropic:claude');
  });

  it('on a draft, a failed write rolls back the draft-store model too', async () => {
    hasDetailData = false; // draft, no row
    useDraftStore.setState({ draftId: ID, draftModelId: null }); // this id IS the active draft
    patchSpy.mockRejectedValue(new Error('network error'));
    const { result } = render(ID);
    await act(async () => {
      await result.current.onModelChange('openai:gpt-4o');
    });
    expect(result.current.modelId).toBeNull();
    expect(useDraftStore.getState().draftModelId).toBeNull();
  });

  it('with an undefined conversationId the change updates local state but does not PATCH', () => {
    const { result } = render(undefined);
    act(() => void result.current.onModelChange('openai:gpt-4o'));
    expect(result.current.modelId).toBe('openai:gpt-4o');
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it('beforeSend resolves after the in-flight write settles', async () => {
    let release!: () => void;
    patchSpy.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = () => r();
        }),
    );
    const { result } = render(ID);
    act(() => void result.current.onModelChange('anthropic:claude'));
    let settled = false;
    const waiter = result.current.beforeSend().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    release();
    await waiter;
    expect(settled).toBe(true);
  });
});
