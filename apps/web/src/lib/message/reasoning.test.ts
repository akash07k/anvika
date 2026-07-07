import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import * as apiClient from '../api-client';
import {
  baselineEffort,
  createReasoningOverrideWriter,
  reasoningTextOf,
  toggleDecision,
} from './reasoning';

/** Build a bare UIMessage from an arbitrary parts array for the concatenation tests. */
function messageWithParts(parts: UIMessage['parts']): UIMessage {
  return { id: 'm1', role: 'assistant', parts } as UIMessage;
}

describe('reasoningTextOf', () => {
  it('concatenates every reasoning part in order', () => {
    const message = messageWithParts([
      { type: 'reasoning', text: 'First I consider ' },
      { type: 'reasoning', text: 'then I conclude.' },
    ]);
    expect(reasoningTextOf(message)).toBe('First I consider then I conclude.');
  });

  it('ignores text parts, so only the thinking is returned', () => {
    const message = messageWithParts([
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: ' the answer' },
    ]);
    expect(reasoningTextOf(message)).toBe('thinking');
  });

  it('returns an empty string when there are no reasoning parts', () => {
    const message = messageWithParts([{ type: 'text', text: 'just an answer' }]);
    expect(reasoningTextOf(message)).toBe('');
  });
});

/** Build a minimal RedactedSettings shape for baselineEffort tests (no secret fields needed). */
function makeSettings(
  overrides: Partial<Pick<RedactedSettings, 'selectedModelId' | 'connections' | 'reasoningEffort'>>,
): RedactedSettings {
  return {
    connections: [],
    selectedModelId: '',
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
    ...overrides,
  } as RedactedSettings;
}

describe('baselineEffort', () => {
  it('returns medium when settings is null', () => {
    expect(baselineEffort(null)).toBe('medium');
  });

  it('returns the global reasoningEffort when no connection override is active', () => {
    const settings = makeSettings({ reasoningEffort: 'high', selectedModelId: 'conn1:model-a' });
    expect(baselineEffort(settings)).toBe('high');
  });

  it('returns the connection effort when the active connection has a non-inherit override', () => {
    const settings = makeSettings({
      selectedModelId: 'conn1:model-a',
      reasoningEffort: 'high',
      connections: [
        {
          id: 'conn1',
          type: 'anthropic',
          label: 'My Anthropic',
          enabled: true,
          reasoningEffort: 'low',
          apiKey: { isSet: false },
        },
      ],
    });
    expect(baselineEffort(settings)).toBe('low');
  });

  it('falls back to the global reasoningEffort when the connection effort is inherit', () => {
    const settings = makeSettings({
      selectedModelId: 'conn1:model-a',
      reasoningEffort: 'high',
      connections: [
        {
          id: 'conn1',
          type: 'anthropic',
          label: 'My Anthropic',
          enabled: true,
          reasoningEffort: 'inherit',
          apiKey: { isSet: false },
        },
      ],
    });
    expect(baselineEffort(settings)).toBe('high');
  });

  it('falls back to global when the model id has no connection prefix match', () => {
    const settings = makeSettings({
      selectedModelId: 'other:model-b',
      reasoningEffort: 'low',
      connections: [
        {
          id: 'conn1',
          type: 'anthropic',
          label: 'My Anthropic',
          enabled: true,
          reasoningEffort: 'high',
          apiKey: { isSet: false },
        },
      ],
    });
    expect(baselineEffort(settings)).toBe('low');
  });
});

describe('toggleDecision', () => {
  it('turns thinking off when it is effectively on (override is non-inherit and non-off)', () => {
    const result = toggleDecision('medium', 'medium');
    expect(result).toEqual({ next: 'off', announced: 'off' });
  });

  it('turns thinking off when override is inherit and baseline is on', () => {
    const result = toggleDecision('inherit', 'high');
    expect(result).toEqual({ next: 'off', announced: 'off' });
  });

  it('restores to inherit (clears the off pin) when override is off but baseline is on', () => {
    const result = toggleDecision('off', 'medium');
    expect(result).toEqual({ next: 'inherit', announced: 'medium' });
  });

  it('restores to inherit and announces the exact baseline level', () => {
    const result = toggleDecision('off', 'high');
    expect(result).toEqual({ next: 'inherit', announced: 'high' });
  });

  it('turns on to medium when both override and baseline are off', () => {
    const result = toggleDecision('off', 'off');
    expect(result).toEqual({ next: 'medium', announced: 'medium' });
  });

  it('turns on to medium when override is inherit and baseline is also off', () => {
    const result = toggleDecision('inherit', 'off');
    expect(result).toEqual({ next: 'medium', announced: 'medium' });
  });
});

const ID = 'aaa-111';

describe('createReasoningOverrideWriter', () => {
  // Use vi.spyOn (not vi.mock) to avoid a vitest jsdom teardown hang with never-settling
  // Promise factories. Both approaches intercept the same call; spyOn is safe here because
  // the test file imports the real module and patches the live binding.
  let patchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    patchSpy = vi.spyOn(apiClient, 'apiPatchNoContent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the chosen override via the id-scoped 204 PATCH and resolves the tracked promise', async () => {
    patchSpy.mockResolvedValue(undefined as never);
    const writer = createReasoningOverrideWriter(ID);
    const p = writer.write('high');
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: 'high',
    });
    await expect(p).resolves.toBeUndefined();
    await expect(writer.pending()).resolves.toBeUndefined();
  });

  it('write(null) clears the override at the id-scoped endpoint', async () => {
    patchSpy.mockResolvedValue(undefined as never);
    const writer = createReasoningOverrideWriter(ID);
    await writer.write(null);
    expect(patchSpy).toHaveBeenCalledWith(`/api/v1/conversations/${ID}/reasoning`, {
      reasoningOverride: null,
    });
  });

  it('pending() awaits the latest in-flight write before resolving', async () => {
    let release!: () => void;
    patchSpy.mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = () => r();
        }) as never,
    );
    const writer = createReasoningOverrideWriter(ID);
    void writer.write('low');
    let settled = false;
    const waiter = writer.pending().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    release();
    await waiter;
    expect(settled).toBe(true);
  });

  it('a rejected write does NOT reject pending() -- pending always resolves', async () => {
    patchSpy.mockRejectedValue(new Error('network error') as never);
    const writer = createReasoningOverrideWriter(ID);
    // The write promise itself rejects.
    await expect(writer.write('medium')).rejects.toThrow('network error');
    // pending() must still resolve (never reject), so the send gate is always await-safe.
    await expect(writer.pending()).resolves.toBeUndefined();
  });
});
