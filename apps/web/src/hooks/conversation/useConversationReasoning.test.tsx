import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import type { RedactedSettings } from '@anvika/shared/settings/redact';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

import * as apiClient from '../../lib/api-client';
import {
  conversationDetailKey,
  conversationsListKey,
} from '../../lib/conversation/conversationQueries';
import { useConversationReasoning } from './useConversationReasoning';

const ID = 'xyz-789';

// Use vi.spyOn (not vi.mock) on api-client to avoid a vitest jsdom teardown hang with
// never-settling Promise factories (same pattern as reasoning.test.ts).
let patchSpy: ReturnType<typeof vi.spyOn>;

// Mutable stubs for the two query hooks so each test can drive their return values.
// vi.mock is safe for these modules (no never-settling promise teardown risk).
let detailOverride: string | null = null;
let modelsData:
  | Array<{ id: string; capabilities: { text: boolean; reasoning: boolean } }>
  | undefined;
let hasDetailData = false;

vi.mock('../../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../../lib/conversation/conversationQueries')>(
    '../../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationDetail: () => ({
      // Mirror the real contract: a not-found draft resolves to null (success), not undefined.
      data: hasDetailData
        ? ({ messages: [], reasoningOverride: detailOverride } as {
            messages: unknown[];
            reasoningOverride: string | null;
          } | null)
        : null,
    }),
  };
});

vi.mock('./useModels', () => ({
  useModels: () => ({ data: modelsData }),
}));

/** Minimal redacted settings for tests that only need selectedModelId. */
function settingsFor(selectedModelId: string): RedactedSettings {
  return {
    connections: [],
    selectedModelId,
    reasoningEffort: 'medium',
    userName: 'You',
    assistantName: 'Assistant',
    currency: 'USD',
    inrPerUsd: 95.11,
    autoRefreshFxRate: false,
    inrPerUsdUpdatedAt: null,
    timestampWeekday: true,
    timestampDateStyle: 'day-first',
    timestampHourCycle: 'h12',
    timestampSeconds: true,
    announcementPeriodMs: 2000,
    readWholeOnComplete: false,
    focusOnCompletion: 'keep',
    sendKeyMode: 'modEnter',
    quickNavSinglePressReads: 'descriptor',
    quickNavDoublePressMs: 500,
    quickNavLengthCue: 'count-first',
    quickNavPreviewWords: 40,
    hotkeyBindings: DEFAULT_KEYMAP,
  } as RedactedSettings;
}

const events: NotificationEvent[] = [];
let queryClient: QueryClient;

/** Render the hook under a fresh retry-off QueryClient, returning the client too. */
function render(id: string | undefined, settings: RedactedSettings) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useConversationReasoning(id, settings), { wrapper });
}

beforeEach(() => {
  patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
  detailOverride = null;
  hasDetailData = false;
  modelsData = undefined;
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useConversationReasoning', () => {
  it('seeds override from the id-scoped conversation detail reasoningOverride', () => {
    hasDetailData = true;
    detailOverride = 'low';
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.override).toBe('low');
  });

  it('seeds override to inherit on a draft id whose detail is not-found (data null)', () => {
    // A draft id has no persisted row: useConversationDetail resolves not-found to null, so
    // detail.data?.reasoningOverride is undefined -> seeded to inherit.
    hasDetailData = false;
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.override).toBe('inherit');
  });

  it('defaults override to inherit when detail data is undefined', () => {
    hasDetailData = false;
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.override).toBe('inherit');
  });

  it('capable is true when the active model has reasoning capability', () => {
    modelsData = [{ id: 'model-a', capabilities: { text: true, reasoning: true } }];
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.capable).toBe(true);
  });

  it('capable is false when the active model does not have reasoning capability', () => {
    modelsData = [{ id: 'model-a', capabilities: { text: true, reasoning: false } }];
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.capable).toBe(false);
  });

  it('capable is false when models data is undefined', () => {
    modelsData = undefined;
    const { result } = render(ID, settingsFor('model-a'));
    expect(result.current.capable).toBe(false);
  });

  it('onEffortChange sets override optimistically and PATCHes the id-scoped endpoint with the effort', () => {
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onEffortChange('off'));
    expect(result.current.override).toBe('off');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'off',
    });
  });

  it('onEffortChange with inherit PATCHes the id-scoped endpoint with null', () => {
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onEffortChange('inherit'));
    expect(result.current.override).toBe('inherit');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: null,
    });
  });

  it('on a successful write invalidates the id-scoped detail and the list', async () => {
    const { result } = render(ID, settingsFor('model-a'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => result.current.onEffortChange('high'));
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationDetailKey(ID) });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: conversationsListKey });
    });
  });

  it('a write still targets the id-scoped endpoint on a draft id (the server create-if-absents)', () => {
    // Detail is not-found (null, no row) but the write goes to the same id-scoped endpoint; the
    // client does not special-case the draft.
    hasDetailData = false;
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onEffortChange('medium'));
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'medium',
    });
  });

  it('notifies reasoningOverrideSaveFailed when the write rejects', async () => {
    patchSpy.mockRejectedValue(new Error('network error'));
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onEffortChange('high'));
    await waitFor(() => {
      expect(events).toContainEqual({ type: 'reasoningOverrideSaveFailed' });
    });
  });

  it('with an undefined conversationId the toggle updates local state but does not PATCH', () => {
    const { result } = render(undefined, settingsFor('model-a'));
    act(() => result.current.onEffortChange('off'));
    expect(result.current.override).toBe('off');
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
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onEffortChange('medium'));
    let settled = false;
    const waiter = result.current.beforeSend().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    release();
    await waiter;
    expect(settled).toBe(true);
  });

  it('onToggleThinking flips override to off and notifies reasoningEffortChanged when thinking is on', () => {
    // Override is inherit and baseline (global) is medium -> effectively on -> should go to off.
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onToggleThinking());
    expect(result.current.override).toBe('off');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'off',
    });
    expect(events).toContainEqual({ type: 'reasoningEffortChanged', effort: 'off' });
  });

  it('onToggleThinking restores to inherit and announces baseline when override is off and baseline is on', () => {
    // Start with override pinned to off.
    hasDetailData = true;
    detailOverride = 'off';
    const { result } = render(ID, settingsFor('model-a'));
    act(() => result.current.onToggleThinking());
    expect(result.current.override).toBe('inherit');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: null,
    });
    // Announced the restored baseline (global default medium).
    expect(events).toContainEqual({ type: 'reasoningEffortChanged', effort: 'medium' });
  });
});
