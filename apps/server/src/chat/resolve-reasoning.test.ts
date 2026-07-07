import { SettingsSchema } from '@anvika/shared/settings/schema';
import { describe, expect, it } from 'vitest';

import { resolveReasoning } from './resolve-reasoning';

const settingsWith = (reasoningEffort: 'off' | 'low' | 'medium' | 'high', connType = 'anthropic') =>
  SettingsSchema.parse({
    reasoningEffort,
    connections: [{ id: 'c', label: 'C', type: connType, apiKey: 'sk' }],
  });

describe('resolveReasoning', () => {
  it('disables when the effective effort is off', () => {
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings: settingsWith('off'),
      conversationOverride: null,
    });
    expect(decision).toEqual({ enabled: false });
  });

  it('disables when the model is not reasoning-capable even at a non-off effort', () => {
    const decision = resolveReasoning({
      modelId: 'c:claude-2',
      settings: settingsWith('high'),
      conversationOverride: null,
    });
    expect(decision).toEqual({ enabled: false });
  });

  it('disables on an unparseable or unknown-connection model id', () => {
    expect(
      resolveReasoning({
        modelId: 'bare',
        settings: settingsWith('high'),
        conversationOverride: null,
      }),
    ).toEqual({ enabled: false });
    expect(
      resolveReasoning({
        modelId: 'nope:claude-sonnet-4-5',
        settings: settingsWith('high'),
        conversationOverride: null,
      }),
    ).toEqual({ enabled: false });
  });

  it('enables with the registry enable when capable and effort is non-off (global layer)', () => {
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings: settingsWith('low'),
      conversationOverride: null,
    });
    expect(decision).toEqual({
      enabled: true,
      effort: 'low',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } } },
      },
    });
  });

  it('lets a conversation override win over the global effort', () => {
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings: settingsWith('off'),
      conversationOverride: 'high',
    });
    expect(decision).toEqual({
      enabled: true,
      effort: 'high',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 16384 } } },
      },
    });
  });

  it('lets a per-connection effort override win over the global effort', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'low',
      connections: [
        { id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk', reasoningEffort: 'high' },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings,
      conversationOverride: null,
    });
    // Connection 'high' wins over global 'low' (budgetTokens 16384, not 2048).
    expect(decision).toEqual({
      enabled: true,
      effort: 'high',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 16384 } } },
      },
    });
  });

  it('lets a conversation override win over a per-connection override', () => {
    const settings = SettingsSchema.parse({
      reasoningEffort: 'off',
      connections: [
        { id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk', reasoningEffort: 'high' },
      ],
    });
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings,
      conversationOverride: 'low',
    });
    // Conversation 'low' wins over the connection 'high' AND the global 'off' (budgetTokens 2048).
    expect(decision).toEqual({
      enabled: true,
      effort: 'low',
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 2048 } } },
      },
    });
  });

  it('lets a conversation override of off disable a non-off global effort', () => {
    const decision = resolveReasoning({
      modelId: 'c:claude-sonnet-4-5',
      settings: settingsWith('high'),
      conversationOverride: 'off',
    });
    expect(decision).toEqual({ enabled: false });
  });
});
