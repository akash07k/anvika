import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import type { ReasoningDecision } from './resolve-reasoning';
import { reasoningModelFor, reasoningProviderOptionsFor } from './reasoning-apply';

const mockV3Model = new MockLanguageModelV3();

describe('reasoningProviderOptionsFor', () => {
  it('returns undefined when reasoning is disabled', () => {
    expect(reasoningProviderOptionsFor({ enabled: false })).toBeUndefined();
  });

  it('passes provider-options through unchanged', () => {
    const decision: ReasoningDecision = {
      enabled: true,
      effort: 'medium',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } } },
      },
    };
    expect(reasoningProviderOptionsFor(decision)).toEqual({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } },
    });
  });

  it('translates a unified enable into google thinkingConfig.thinkingLevel with includeThoughts', () => {
    const decision: ReasoningDecision = {
      enabled: true,
      effort: 'medium',
      enable: { kind: 'unified', reasoning: 'medium' },
    };
    expect(reasoningProviderOptionsFor(decision)).toEqual({
      google: { thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true } },
    });
  });

  it('returns undefined for a middleware enable (no provider options)', () => {
    const decision: ReasoningDecision = {
      enabled: true,
      effort: 'medium',
      enable: { kind: 'middleware', tagName: 'think' },
    };
    expect(reasoningProviderOptionsFor(decision)).toBeUndefined();
  });
});

describe('reasoningModelFor', () => {
  it('wraps the model for a middleware enable (returns a different reference)', () => {
    const wrapped = reasoningModelFor(mockV3Model, {
      enabled: true,
      effort: 'medium',
      enable: { kind: 'middleware', tagName: 'think' },
    });
    expect(wrapped).not.toBe(mockV3Model);
  });

  it('returns the same model unchanged when reasoning is disabled', () => {
    expect(reasoningModelFor(mockV3Model, { enabled: false })).toBe(mockV3Model);
  });

  it('returns the same model unchanged for a provider-options enable (no wrap)', () => {
    const decision: ReasoningDecision = {
      enabled: true,
      effort: 'medium',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } } },
      },
    };
    expect(reasoningModelFor(mockV3Model, decision)).toBe(mockV3Model);
  });

  it('returns the same model unchanged for a unified enable (no wrap)', () => {
    const decision: ReasoningDecision = {
      enabled: true,
      effort: 'medium',
      enable: { kind: 'unified', reasoning: 'medium' },
    };
    expect(reasoningModelFor(mockV3Model, decision)).toBe(mockV3Model);
  });

  it('spreads a local enable body and wraps the think middleware', () => {
    const enable = {
      kind: 'local',
      providerOptions: {
        local: { reasoning_effort: 'medium', chat_template_kwargs: { enable_thinking: true } },
      },
      tagName: 'think',
    } as const;
    const decision = { enabled: true, effort: 'medium', enable } as const;
    expect(reasoningProviderOptionsFor(decision)).toEqual(enable.providerOptions);
    expect(reasoningModelFor(mockV3Model, decision)).not.toBe(mockV3Model);
  });

  it('spreads a suppress body but does not wrap (disabled)', () => {
    const decision = {
      enabled: false,
      suppress: {
        providerOptions: {
          local: { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } },
        },
      },
    } as const;
    expect(reasoningProviderOptionsFor(decision)).toEqual(decision.suppress.providerOptions);
    expect(reasoningModelFor(mockV3Model, decision)).toBe(mockV3Model);
  });

  it('returns undefined options and no wrap for a plain disabled decision', () => {
    const decision = { enabled: false } as const;
    expect(reasoningProviderOptionsFor(decision)).toBeUndefined();
    expect(reasoningModelFor(mockV3Model, decision)).toBe(mockV3Model);
  });
});
