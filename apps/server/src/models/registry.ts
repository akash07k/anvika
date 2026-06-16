import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure, type AzureOpenAIProvider } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createProviderRegistry, type LanguageModel, type ProviderRegistryProvider } from 'ai';

import type { Connection } from '@anvika/shared/settings/connection';
import type { Settings } from '@anvika/shared/settings/schema';

import { parseModelId } from './connection-type';
import { isAzureReasoningContentDeployment } from './reasoning-rules';

/**
 * Thrown when the selected model's provider is not configured (no key, or for Azure no
 * resource/deployment, or an empty/unknown id). The chat route maps it to the `unconfigured` API
 * error pointing the user to settings. The message is caller-supplied.
 */
export class ChatProviderUnconfiguredError extends Error {
  /** @param message - The human-facing reason, pointing the user to settings. */
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderUnconfiguredError';
  }
}

/** The shape `createProviderRegistry` accepts for a single registered provider. */
type RegisteredProvider = Parameters<typeof createProviderRegistry>[0][string];

/**
 * Build an AI SDK provider registry from validated, plaintext settings, registering one AI SDK
 * provider per configured connection keyed by the connection's `id` (the model-id namespace prefix).
 * A connection is configured when {@link providerForConnection} can build it (its required credential
 * is present); an unconfigured connection is simply absent, so resolving its model throws inside
 * `languageModel`. Per-request construction is cheap and means a just-saved connection takes effect
 * with no restart.
 *
 * @param settings - The validated settings holding the user's connection list with plaintext secrets.
 * @returns A provider registry keyed by connection id, separator `':'`.
 */
export function buildRegistry(settings: Settings): ProviderRegistryProvider {
  const registered: Record<string, RegisteredProvider> = {};
  for (const connection of settings.connections) {
    const provider = providerForConnection(connection);
    if (provider) registered[connection.id] = provider;
  }
  return createProviderRegistry(registered, { separator: ':' });
}

/**
 * Normalize an Azure base URL so the v1 endpoint resolves correctly. `@ai-sdk/azure` appends `/v1`
 * to the given base URL, so a base URL that already ends in `/v1` (e.g. a pasted
 * `https://{resource}.openai.azure.com/openai/v1`) would double to `.../v1/v1`. Strip a single
 * trailing `/v1` (and any trailing slash); URLs without it pass through unchanged.
 *
 * @param baseUrl - The operator-entered Azure base URL.
 * @returns The base URL with a trailing `/v1` removed if present.
 */
export function normalizeAzureBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, '');
}

/**
 * Build the Azure provider for an azure connection, or `null` when its credentials are incomplete (no
 * key, or neither a resource name nor a base URL). Shared by the registry construction and the
 * DeepSeek-factory resolution path so the `createAzure` options stay in one place.
 *
 * @param connection - A validated connection from settings.
 * @returns The Azure provider, or `null` when the azure connection is unconfigured / not azure.
 */
function azureProviderFor(connection: Connection): AzureOpenAIProvider | null {
  if (connection.type !== 'azure') return null;
  if (!connection.apiKey || !(connection.resourceName || connection.baseUrl)) return null;
  return createAzure({
    apiKey: connection.apiKey,
    ...(connection.resourceName ? { resourceName: connection.resourceName } : {}),
    ...(connection.baseUrl ? { baseURL: normalizeAzureBaseUrl(connection.baseUrl) } : {}),
    ...(connection.apiVersion ? { apiVersion: connection.apiVersion } : {}),
  });
}

/**
 * Build one AI SDK provider for a connection, or `null` when its required credential is missing (the
 * connection is then simply absent from the registry, exactly as an unconfigured provider was before).
 *
 * @param connection - A validated connection from settings.
 * @returns The provider instance, or `null` when the connection lacks its required credential.
 */
function providerForConnection(connection: Connection): RegisteredProvider | null {
  switch (connection.type) {
    case 'anthropic':
      return connection.apiKey
        ? createAnthropic({
            apiKey: connection.apiKey,
            ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
          })
        : null;
    case 'openai':
      return connection.apiKey
        ? createOpenAI({
            apiKey: connection.apiKey,
            ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
          })
        : null;
    case 'google':
      return connection.apiKey
        ? createGoogleGenerativeAI({
            apiKey: connection.apiKey,
            ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
          })
        : null;
    case 'xai':
      return connection.apiKey
        ? createXai({
            apiKey: connection.apiKey,
            ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
          })
        : null;
    case 'openrouter':
      return connection.apiKey
        ? createOpenRouter({
            apiKey: connection.apiKey,
            ...(connection.baseUrl ? { baseURL: connection.baseUrl } : {}),
          })
        : null;
    case 'azure':
      return azureProviderFor(connection);
    case 'openai-compatible':
      return createOpenAICompatible({
        name: connection.id,
        baseURL: connection.baseUrl,
        ...(connection.apiKey ? { apiKey: connection.apiKey } : {}),
        ...(connection.headers ? { headers: connection.headers } : {}),
      });
    default:
      return null;
  }
}

/**
 * Resolve a namespaced `connectionId:model` id to a {@link LanguageModel} from settings. An empty id,
 * or an id whose connection is not configured, throws {@link ChatProviderUnconfiguredError} (the
 * registry throws on an unregistered connection; we catch and rethrow with a settings-pointing
 * message). A registered connection passes any model string through, so the custom-model-id escape
 * hatch resolves for free.
 *
 * @param settings - The validated settings.
 * @param modelId - The namespaced model id (the settings `selectedModelId`).
 * @returns The resolved language model.
 * @throws ChatProviderUnconfiguredError When the id is empty or its connection is unconfigured.
 */
export function resolveModelFromSettings(settings: Settings, modelId: string): LanguageModel {
  if (!modelId) {
    throw new ChatProviderUnconfiguredError('No model is selected. Choose a model in Settings.');
  }
  // Azure reasoning_content deployments (DeepSeek, Kimi) need the azure.deepseek() factory so
  // `reasoning_content` is parsed; the generic registry path would use the default (Responses)
  // factory and drop it.
  const parsed = parseModelId(modelId);
  if (parsed !== null) {
    const connection = settings.connections.find((c) => c.id === parsed.connectionId);
    if (connection?.type === 'azure' && isAzureReasoningContentDeployment(parsed.model)) {
      const azureProvider = azureProviderFor(connection);
      if (azureProvider !== null) return azureProvider.deepseek(parsed.model);
    }
  }
  const registry = buildRegistry(settings);
  try {
    return registry.languageModel(modelId as `${string}:${string}`);
  } catch {
    throw new ChatProviderUnconfiguredError(
      `The provider for "${modelId}" is not configured. Add its key and select a model in Settings.`,
    );
  }
}
