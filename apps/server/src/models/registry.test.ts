import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import {
  buildRegistry,
  normalizeAzureBaseUrl,
  resolveModelFromSettings,
  ChatProviderUnconfiguredError,
} from './registry';

function settingsWith(connections: unknown[]) {
  return SettingsSchema.parse({ connections, selectedModelId: '' });
}

describe('buildRegistry', () => {
  it('registers one provider per configured connection, keyed by id', () => {
    const settings = settingsWith([
      { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' },
      { id: 'home', label: 'Home', type: 'anthropic', apiKey: 'sk2' },
      {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        baseUrl: 'https://api.venice.ai/api/v1',
      },
    ]);
    const registry = buildRegistry(settings);
    expect(() => registry.languageModel('work:claude-haiku-4-5')).not.toThrow();
    expect(() => registry.languageModel('home:claude-haiku-4-5')).not.toThrow();
    expect(() => registry.languageModel('venice:llama-3.3-70b')).not.toThrow();
  });

  it('skips a connection missing its required credential', () => {
    const settings = settingsWith([{ id: 'work', label: 'Work', type: 'anthropic' }]);
    expect(() => resolveModelFromSettings(settings, 'work:claude')).toThrow(
      ChatProviderUnconfiguredError,
    );
  });

  it('resolves Azure reasoning_content deployments (DeepSeek + Kimi) via the azure.deepseek() factory', () => {
    const settings = settingsWith([
      { id: 'az', label: 'Azure', type: 'azure', apiKey: 'sk', resourceName: 'res' },
    ]);
    for (const dep of ['DeepSeek-V4-Pro', 'Kimi-K2.6']) {
      const model = resolveModelFromSettings(settings, `az:${dep}`);
      expect((model as { provider?: string }).provider).toBe('azure.deepseek');
    }
    const gpt = resolveModelFromSettings(settings, 'az:gpt-5.4-mini');
    expect((gpt as { provider?: string }).provider).not.toBe('azure.deepseek');
  });
});

describe('normalizeAzureBaseUrl', () => {
  it('strips a trailing /v1 (the provider re-appends it) so the v1 endpoint URL works when pasted', () => {
    expect(normalizeAzureBaseUrl('https://ai-walnut.openai.azure.com/openai/v1')).toBe(
      'https://ai-walnut.openai.azure.com/openai',
    );
    expect(normalizeAzureBaseUrl('https://ai-walnut.openai.azure.com/openai/v1/')).toBe(
      'https://ai-walnut.openai.azure.com/openai',
    );
  });

  it('leaves a base URL without a trailing /v1 unchanged', () => {
    expect(normalizeAzureBaseUrl('https://ai-walnut.openai.azure.com/openai')).toBe(
      'https://ai-walnut.openai.azure.com/openai',
    );
    expect(normalizeAzureBaseUrl('https://custom.example.com/azure')).toBe(
      'https://custom.example.com/azure',
    );
  });
});
