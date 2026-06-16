import { SettingsSchema } from '@anvika/shared/settings/schema';
import { describe, expect, it } from 'vitest';

import { resolveReasoning } from './resolve-reasoning';

describe('resolveReasoning - local (openai-compatible) connections', () => {
  it('builds a connection-id-keyed local enable for an openai-compatible model (on)', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'medium',
      connections: [
        {
          id: 'local',
          label: 'Local',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:5001/v1',
          enabled: true,
          reasoningEffort: 'inherit',
          sendThinkingParams: true,
        },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'local:qwen3',
      settings,
      conversationOverride: null,
    });
    expect(decision).toEqual({
      enabled: true,
      effort: 'medium',
      enable: {
        kind: 'local',
        providerOptions: {
          local: { reasoning_effort: 'medium', chat_template_kwargs: { enable_thinking: true } },
        },
        tagName: 'think',
      },
    });
  });

  it('omits chat_template_kwargs when sendThinkingParams is false (on)', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'high',
      connections: [
        {
          id: 'local',
          label: 'Local',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:5001/v1',
          enabled: true,
          reasoningEffort: 'inherit',
          sendThinkingParams: false,
        },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'local:qwen3',
      settings,
      conversationOverride: null,
    });
    expect(decision).toEqual({
      enabled: true,
      effort: 'high',
      enable: {
        kind: 'local',
        providerOptions: { local: { reasoning_effort: 'high' } },
        tagName: 'think',
      },
    });
  });

  it('actively suppresses thinking for a local connection set to off', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'medium',
      connections: [
        {
          id: 'local',
          label: 'Local',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:5001/v1',
          enabled: true,
          reasoningEffort: 'off',
          sendThinkingParams: true,
        },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'local:qwen3',
      settings,
      conversationOverride: null,
    });
    expect(decision).toEqual({
      enabled: false,
      suppress: {
        providerOptions: {
          local: { reasoning_effort: 'none', chat_template_kwargs: { enable_thinking: false } },
        },
      },
    });
  });

  it('suppress body contains only reasoning_effort when sendThinkingParams is false (off path)', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'medium',
      connections: [
        {
          id: 'local',
          label: 'Local',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:5001/v1',
          enabled: true,
          reasoningEffort: 'off',
          sendThinkingParams: false,
        },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'local:qwen3',
      settings,
      conversationOverride: null,
    });
    // The toEqual above already proves chat_template_kwargs is absent when sendThinkingParams is
    // false: the suppress body matches exactly { local: { reasoning_effort: 'none' } } and nothing
    // more.
    expect(decision).toEqual({
      enabled: false,
      suppress: {
        providerOptions: {
          local: { reasoning_effort: 'none' },
        },
      },
    });
  });

  it('keeps cloud off a plain no-op (no suppress)', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'off',
      connections: [
        {
          id: 'oai',
          label: 'OpenAI',
          type: 'openai',
          apiKey: 'k',
          reasoningEffort: 'inherit',
          enabled: true,
        },
      ],
    });
    expect(resolveReasoning({ modelId: 'oai:o3', settings, conversationOverride: null })).toEqual({
      enabled: false,
    });
  });
});
