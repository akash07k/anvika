import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import type { RedactedSettings } from '@anvika/shared/settings/redact';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

import * as apiClient from '../../lib/api-client';
import { useConversationReasoning } from './useConversationReasoning';

const ID = 'aaa-111';

// Mutable stubs shared with the sibling test file (each file has its own module-scope copies
// because vi.mock is per-file in vitest). They are reset in beforeEach.
let detailOverride: string | null = null;
let hasDetailData = false;

vi.mock('../../lib/conversation/conversationQueries', async () => {
  const actual = await vi.importActual<typeof import('../../lib/conversation/conversationQueries')>(
    '../../lib/conversation/conversationQueries',
  );
  return {
    ...actual,
    useConversationDetail: () => ({
      data: hasDetailData ? { messages: [], reasoningOverride: detailOverride } : undefined,
    }),
  };
});

vi.mock('./useModels', () => ({
  useModels: () => ({ data: undefined }),
}));

/** Settings with global reasoningEffort set to `effort`. */
function settingsWithEffort(effort: RedactedSettings['reasoningEffort']): RedactedSettings {
  return {
    connections: [],
    selectedModelId: '',
    reasoningEffort: effort,
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

let patchSpy: ReturnType<typeof vi.spyOn>;
const events: NotificationEvent[] = [];

/** Render the hook under a fresh retry-off QueryClient. */
function render(settings: RedactedSettings) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useConversationReasoning(ID, settings), { wrapper });
}

beforeEach(() => {
  patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent').mockResolvedValue(undefined);
  detailOverride = null;
  hasDetailData = false;
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  vi.restoreAllMocks();
  resetChannels();
});

describe('useConversationReasoning -- onToggleThinking', () => {
  it('flips override to off and notifies reasoningEffortChanged when thinking is on', () => {
    // Override is inherit and baseline (global) is medium -> effectively on -> should go to off.
    const { result } = render(settingsWithEffort('medium'));
    act(() => result.current.onToggleThinking());
    expect(result.current.override).toBe('off');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'off',
    });
    expect(events).toContainEqual({ type: 'reasoningEffortChanged', effort: 'off' });
  });

  it('sets override to medium and announces medium when both override and baseline are off', () => {
    // Conversation override is pinned to off; global baseline is also off.
    hasDetailData = true;
    detailOverride = 'off';
    const { result } = render(settingsWithEffort('off'));
    act(() => result.current.onToggleThinking());
    // Both off -> medium.
    expect(result.current.override).toBe('medium');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'medium',
    });
    expect(events).toContainEqual({ type: 'reasoningEffortChanged', effort: 'medium' });
  });

  it('restores to inherit and announces baseline when override is off and baseline is on', () => {
    // Start with override pinned to off; global baseline is medium.
    hasDetailData = true;
    detailOverride = 'off';
    const { result } = render(settingsWithEffort('medium'));
    act(() => result.current.onToggleThinking());
    expect(result.current.override).toBe('inherit');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: null,
    });
    // Announced the restored baseline (global default medium).
    expect(events).toContainEqual({ type: 'reasoningEffortChanged', effort: 'medium' });
  });
});
