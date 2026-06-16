import { describe, expect, it, vi } from 'vitest';

import { createReasoningTimer, localThinkingParamsActive } from './reasoning-apply';

describe('localThinkingParamsActive', () => {
  it('returns true for an enabled local enable carrying chat_template_kwargs', () => {
    expect(
      localThinkingParamsActive({
        enabled: true,
        effort: 'low',
        enable: {
          kind: 'local',
          providerOptions: {
            local: { reasoning_effort: 'low', chat_template_kwargs: { enable_thinking: true } },
          },
          tagName: 'think',
        },
      }),
    ).toBe(true);
  });

  it('returns false for an enabled local enable WITHOUT chat_template_kwargs (sendThinkingParams false)', () => {
    expect(
      localThinkingParamsActive({
        enabled: true,
        effort: 'low',
        enable: {
          kind: 'local',
          providerOptions: { local: { reasoning_effort: 'low' } },
          tagName: 'think',
        },
      }),
    ).toBe(false);
  });

  it('returns true for a suppress body carrying chat_template_kwargs (local off, sendThinkingParams true)', () => {
    expect(
      localThinkingParamsActive({
        enabled: false,
        suppress: {
          providerOptions: {
            local: { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } },
          },
        },
      }),
    ).toBe(true);
  });

  it('returns false for a suppress body with only reasoning_effort (sendThinkingParams false path)', () => {
    expect(
      localThinkingParamsActive({
        enabled: false,
        suppress: {
          providerOptions: {
            local: { reasoning_effort: 'none' },
          },
        },
      }),
    ).toBe(false);
  });

  it('returns false for a disabled decision with no suppress', () => {
    expect(localThinkingParamsActive({ enabled: false })).toBe(false);
  });

  it('returns false for a cloud enabled decision (kind provider-options)', () => {
    expect(
      localThinkingParamsActive({
        enabled: true,
        effort: 'medium',
        enable: {
          kind: 'provider-options',
          providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } } },
        },
      }),
    ).toBe(false);
  });
});

describe('createReasoningTimer', () => {
  it('is undefined before any chunk and when only one side occurred', () => {
    const t = createReasoningTimer();
    expect(t.elapsedMs()).toBeUndefined();
    t.record('reasoning-delta');
    expect(t.elapsedMs()).toBeUndefined();
  });

  it('yields a non-negative gap once reasoning then text have occurred', () => {
    const t = createReasoningTimer();
    t.record('reasoning-delta');
    t.record('text-delta');
    const ms = t.elapsedMs();
    expect(ms).not.toBeUndefined();
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('ignores non-delta chunk types and keeps the first instants', () => {
    const t = createReasoningTimer();
    t.record('reasoning-start');
    t.record('reasoning-delta');
    t.record('reasoning-delta');
    t.record('text-delta');
    expect(t.elapsedMs()).toBeGreaterThanOrEqual(0);
  });

  it('measures the exact gap from the first reasoning delta to the first text delta', () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValueOnce(1000).mockReturnValueOnce(1500);
      const t = createReasoningTimer();
      t.record('reasoning-delta'); // captures 1000
      t.record('text-delta'); // captures 1500
      expect(t.elapsedMs()).toBe(500);
    } finally {
      now.mockRestore();
    }
  });

  it('clamps to 0 (never negative) when text precedes reasoning', () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValueOnce(2000).mockReturnValueOnce(2500);
      const t = createReasoningTimer();
      t.record('text-delta'); // captures 2000 as the first text instant
      t.record('reasoning-delta'); // captures 2500 as the first reasoning instant
      expect(t.elapsedMs()).toBe(0); // max(0, 2000 - 2500)
    } finally {
      now.mockRestore();
    }
  });
});
