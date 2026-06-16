import { describe, expect, it } from 'vitest';

import { reasoningCapabilityFor } from './reasoning-capability';

describe('reasoningCapabilityFor', () => {
  it('returns not-supported for an unmatched (type, model) pair (conservative default)', () => {
    expect(reasoningCapabilityFor('openai', 'gpt-4o')).toEqual({ supported: false });
    expect(reasoningCapabilityFor('anthropic', 'claude-2')).toEqual({ supported: false });
  });

  it('always returns the harmless middleware enable for openai-compatible', () => {
    const cap = reasoningCapabilityFor('openai-compatible', 'whatever-local-model');
    expect(cap.supported).toBe(true);
    if (!cap.supported) throw new Error('expected supported');
    expect(cap.enable('low')).toEqual({ kind: 'middleware', tagName: 'think' });
  });

  it('builds OpenAI provider options with effort only (no verification-gated summary)', () => {
    const cap = reasoningCapabilityFor('openai', 'gpt-5.2');
    if (!cap.supported) throw new Error('expected supported');
    // No `reasoningSummary`: OpenAI gates summaries behind org verification and hard-fails
    // unverified orgs. Effort alone needs no verification, so the turn always succeeds.
    expect(cap.enable('medium')).toEqual({
      kind: 'provider-options',
      providerOptions: { openai: { reasoningEffort: 'medium' } },
    });
    expect(cap.enable('high')).toEqual({
      kind: 'provider-options',
      providerOptions: { openai: { reasoningEffort: 'high' } },
    });
  });

  it('uses the azure namespace for Azure OpenAI reasoning deployments (gpt-5/o), effort only', () => {
    const cap = reasoningCapabilityFor('azure', 'prod-gpt-5-deploy');
    if (!cap.supported) throw new Error('expected supported');
    // Same as OpenAI: no `reasoningSummary` (verification-gated); effort only.
    expect(cap.enable('low')).toEqual({
      kind: 'provider-options',
      providerOptions: { azure: { reasoningEffort: 'low' } },
    });
    expect(cap.enable('high')).toEqual({
      kind: 'provider-options',
      providerOptions: { azure: { reasoningEffort: 'high' } },
    });
    expect(reasoningCapabilityFor('azure', 'opaque-deployment')).toEqual({ supported: false });
  });

  it('matches Azure o3/o4 only as a segment, not as a bare substring', () => {
    // Real reasoning deployments: the token starts the name or follows a separator.
    for (const dep of ['o3-mini', 'my-o4-reasoning', 'prod_o3']) {
      expect(reasoningCapabilityFor('azure', dep).supported).toBe(true);
    }
    // Not reasoning: the token is buried mid-word (gpt-4o is the common false-positive trap).
    for (const dep of ['gpt-4o', 'gpt-4o-mini', 'proto4-test', 'audio3-tts']) {
      expect(reasoningCapabilityFor('azure', dep)).toEqual({ supported: false });
    }
  });

  it('covers Azure reasoning_content deployments (DeepSeek + Kimi) with an azure reasoningEffort enable', () => {
    for (const dep of ['DeepSeek-V4-Pro', 'my-deepseek-v4-flash', 'Kimi-K2.6', 'kimi-k2.6']) {
      const cap = reasoningCapabilityFor('azure', dep);
      if (!cap.supported) throw new Error(`expected supported: ${dep}`);
      expect(cap.enable('medium')).toEqual({
        kind: 'provider-options',
        providerOptions: { azure: { reasoningEffort: 'medium' } },
      });
    }
    // Still not-supported on Azure v1 (no extractable reasoning).
    expect(reasoningCapabilityFor('azure', 'grok-4.3')).toEqual({ supported: false });
    expect(reasoningCapabilityFor('azure', 'Phi-4-reasoning')).toEqual({ supported: false });
  });

  it('builds Anthropic thinking budget tokens from the effort', () => {
    const cap = reasoningCapabilityFor('anthropic', 'claude-sonnet-4-5-20250929');
    if (!cap.supported) throw new Error('expected supported');
    expect(cap.enable('low')).toEqual({
      kind: 'provider-options',
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } } },
    });
    expect(cap.enable('high')).toEqual({
      kind: 'provider-options',
      providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 16384 } } },
    });
    // Haiku 4.5 is extended-thinking-capable too (research doc, up to 64k output); it must match.
    expect(reasoningCapabilityFor('anthropic', 'claude-haiku-4-5').supported).toBe(true);
  });

  it('rounds Gemini 3 Pro medium up to high (Pro accepts only low/high thinkingLevel)', () => {
    const pro = reasoningCapabilityFor('google', 'gemini-3-pro');
    if (!pro.supported) throw new Error('expected supported');
    // Pro: low/high pass through; medium rounds up to high so a default-effort turn still thinks.
    expect(pro.enable('low')).toEqual({ kind: 'unified', reasoning: 'low' });
    expect(pro.enable('medium')).toEqual({ kind: 'unified', reasoning: 'high' });
    expect(pro.enable('high')).toEqual({ kind: 'unified', reasoning: 'high' });
  });

  it('passes Gemini 3 Flash medium through unchanged (Flash accepts medium thinkingLevel)', () => {
    const flash = reasoningCapabilityFor('google', 'gemini-3-flash-preview');
    if (!flash.supported) throw new Error('expected supported');
    expect(flash.enable('medium')).toEqual({ kind: 'unified', reasoning: 'medium' });
  });

  it('uses thinkingConfig for Gemini 2.5', () => {
    const twoFive = reasoningCapabilityFor('google', 'gemini-2.5-flash');
    if (!twoFive.supported) throw new Error('expected supported');
    expect(twoFive.enable('high')).toEqual({
      kind: 'provider-options',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true, thinkingBudget: 16384 } },
      },
    });
  });

  it('enables unified reasoning for the gemini flash rolling aliases', () => {
    for (const id of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
      const cap = reasoningCapabilityFor('google', id);
      expect(cap.supported).toBe(true);
      expect(cap.supported && cap.enable('medium')).toEqual({
        kind: 'unified',
        reasoning: 'medium',
      });
    }
  });

  it('clamps gemini-pro-latest medium to high (Pro rejects medium)', () => {
    const cap = reasoningCapabilityFor('google', 'gemini-pro-latest');
    expect(cap.supported && cap.enable('medium')).toEqual({ kind: 'unified', reasoning: 'high' });
    expect(cap.supported && cap.enable('low')).toEqual({ kind: 'unified', reasoning: 'low' });
  });

  it('versioned Gemini ids are not matched by alias rules and take the normal versioned path', () => {
    // The exact-match alias rules (gemini-pro-latest, gemini-flash-latest, gemini-flash-lite-latest)
    // must NOT over-match a versioned id. A versioned id like gemini-2.5-pro should match the
    // gemini-2.5 startsWith rule (provider-options / thinkingConfig), NOT the alias rule that clamps
    // medium to high (which is only for gemini-pro-latest). Verify the enable kind differs.
    const versioned = reasoningCapabilityFor('google', 'gemini-2.5-pro');
    if (!versioned.supported) throw new Error('expected supported');
    // gemini-2.5-pro takes the thinkingConfig path (provider-options), not the alias unified path.
    expect(versioned.enable('medium')).toEqual({
      kind: 'provider-options',
      providerOptions: {
        google: { thinkingConfig: { includeThoughts: true, thinkingBudget: 8192 } },
      },
    });
    // The alias rule clamps medium to high (unified kind). A versioned id must NOT do that.
    expect(versioned.enable('medium')).not.toEqual({ kind: 'unified', reasoning: 'high' });
  });

  it('builds OpenRouter reasoning effort, matching the upstream family in the id', () => {
    const cap = reasoningCapabilityFor('openrouter', 'anthropic/claude-sonnet-4.5');
    if (!cap.supported) throw new Error('expected supported');
    expect(cap.enable('high')).toEqual({
      kind: 'provider-options',
      providerOptions: { openrouter: { reasoning: { effort: 'high' } } },
    });
    // Haiku 4.5 routed through OpenRouter is capable too.
    expect(reasoningCapabilityFor('openrouter', 'anthropic/claude-haiku-4-5').supported).toBe(true);
    expect(reasoningCapabilityFor('openrouter', 'mistralai/mistral-large')).toEqual({
      supported: false,
    });
  });
});
