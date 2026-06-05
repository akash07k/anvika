import type { LanguageModel } from 'ai';

import type { Settings } from '@anvika/shared/settings/schema';

import { resolveModelFromSettings } from '../models/registry';
import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { loadSettings } from '../settings/service';

/** Options for {@link createSettingsModelResolver}. */
export interface CreateSettingsModelResolverInput {
  /** The injected settings store used to load credentials per request. */
  settingsStore: SettingsStore;
}

/** A resolved chat model plus the namespaced id that produced it. */
export interface ResolvedChatModel {
  /** The resolved language model (a real provider, or a mock in tests). */
  model: LanguageModel;
  /** The server-resolved namespaced `provider:model` id used. */
  resolvedModelId: string;
  /**
   * The validated settings the model resolved from. Carried so the finish seam can map the
   * `connectionId` prefix of `resolvedModelId` to its connection type for the price snapshot
   * (the resolver already loads settings; surfacing it here avoids a second load).
   */
  settings: Settings;
}

/**
 * Build the settings-driven model resolver injected into the chat route: load the
 * owner's settings on each call and resolve the namespaced `modelId` through the provider registry.
 * This is the one authoritative resolution path that replaces the deleted `ANVIKA_AZURE_*` shim.
 * Precedence: an explicit per-request `modelId` wins; otherwise it falls back to
 * `settings.selectedModelId`; when neither names a model the resolver throws
 * `ChatProviderUnconfiguredError`, which the route maps to the `unconfigured` API error. Per-request
 * load means a just-saved key takes effect with no restart.
 *
 * @param input - The injected settings store.
 * @returns An async resolver from a `provider:model` id to a {@link ResolvedChatModel} containing
 *   both the resolved {@link LanguageModel} and the namespaced `resolvedModelId` used.
 */
export function createSettingsModelResolver(
  input: CreateSettingsModelResolverInput,
): (modelId: string) => Promise<ResolvedChatModel> {
  return async (modelId: string) => {
    const { settings } = await loadSettings(input.settingsStore, OWNER_LOCAL);
    // Precedence: an explicit per-request modelId wins; otherwise fall back to the
    // settings-selected model so a thin client that sends only { text } resolves the configured model
    // (ADR 0001). resolveModelFromSettings throws ChatProviderUnconfiguredError when both are empty.
    const resolvedModelId = modelId || settings.selectedModelId;
    return {
      model: resolveModelFromSettings(settings, resolvedModelId),
      resolvedModelId,
      settings,
    };
  };
}
