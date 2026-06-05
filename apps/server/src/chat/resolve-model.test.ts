import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import { ChatProviderUnconfiguredError } from '../models/registry';
import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { createSettingsModelResolver } from './resolve-model';

function fakeStore(overrides: Record<string, unknown>): SettingsStore & {
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  const data = SettingsSchema.parse(overrides);
  const row: StoredSettings = { data, version: CURRENT_SETTINGS_VERSION };
  return { load: vi.fn(async () => row), save: vi.fn(async () => undefined) };
}

describe('createSettingsModelResolver', () => {
  it('loads settings and resolves a configured model', async () => {
    const resolve = createSettingsModelResolver({
      settingsStore: fakeStore({
        connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'a' }],
      }),
    });
    const result = await resolve('anthropic:claude-opus-4-5');
    expect(result.model).toBeDefined();
    expect(result.resolvedModelId).toBe('anthropic:claude-opus-4-5');
  });

  it('rejects an unconfigured provider with ChatProviderUnconfiguredError', async () => {
    const resolve = createSettingsModelResolver({ settingsStore: fakeStore({}) });
    await expect(resolve('anthropic:claude-opus-4-5')).rejects.toBeInstanceOf(
      ChatProviderUnconfiguredError,
    );
  });

  it('rejects an empty id when no settings default is set', async () => {
    const resolve = createSettingsModelResolver({ settingsStore: fakeStore({}) });
    await expect(resolve('')).rejects.toBeInstanceOf(ChatProviderUnconfiguredError);
  });

  it('falls back to settings.selectedModelId when the request modelId is empty', async () => {
    const resolve = createSettingsModelResolver({
      settingsStore: fakeStore({
        connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'a' }],
        selectedModelId: 'anthropic:claude-opus-4-5',
      }),
    });
    const result = await resolve('');
    expect(result.model).toBeDefined();
    expect(result.resolvedModelId).toBe('anthropic:claude-opus-4-5');
  });

  it('lets an explicit request modelId override the settings default', async () => {
    // The settings default points at an UNCONFIGURED provider (openai, no key); the explicit,
    // configured request id must win, proving the request id is used, not the default.
    const resolve = createSettingsModelResolver({
      settingsStore: fakeStore({
        connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'a' }],
        selectedModelId: 'openai:gpt-5',
      }),
    });
    const result = await resolve('anthropic:claude-opus-4-5');
    expect(result.model).toBeDefined();
    expect(result.resolvedModelId).toBe('anthropic:claude-opus-4-5');
  });

  it('rejects when BOTH the request modelId and the settings default are empty', async () => {
    const resolve = createSettingsModelResolver({
      settingsStore: fakeStore({ selectedModelId: '' }),
    });
    await expect(resolve('')).rejects.toBeInstanceOf(ChatProviderUnconfiguredError);
  });
});
