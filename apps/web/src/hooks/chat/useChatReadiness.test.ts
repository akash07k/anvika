import { describe, expect, it } from 'vitest';

import type { ModelInfo } from '@anvika/shared/models/model-info';
import type { RedactedConnection, RedactedSettings } from '@anvika/shared/settings/redact';

import { computeReadiness } from './useChatReadiness';

/** A redacted connection stub: only the fields computeReadiness reads, cast at the boundary. */
function connection(partial: Record<string, unknown>): RedactedConnection {
  return partial as unknown as RedactedConnection;
}

/** Minimal redacted-settings stub: only the fields computeReadiness reads, cast at the boundary. */
function settingsStub(overrides: {
  selectedModelId?: string;
  connections?: RedactedConnection[];
}): RedactedSettings {
  return {
    selectedModelId: overrides.selectedModelId ?? '',
    connections: overrides.connections ?? [],
  } as unknown as RedactedSettings;
}

const model = (id: string, connectionId: string): ModelInfo =>
  ({
    id,
    providerId: 'openai-compatible',
    connectionId,
    connectionLabel: connectionId,
    displayName: id,
    contextWindow: null,
    maxOutputTokens: null,
    inputPrice: null,
    outputPrice: null,
    capabilities: { text: true, reasoning: false },
  }) as ModelInfo;

describe('computeReadiness', () => {
  it('is loading until settings are ready', () => {
    expect(computeReadiness('idle', null, false, [])).toBe('loading');
    expect(computeReadiness('loading', null, false, [])).toBe('loading');
  });

  it('is loading while the models query is pending', () => {
    const settings = settingsStub({
      selectedModelId: 'openai:gpt-4o',
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', settings, true, undefined)).toBe('loading');
  });

  it('is ready when the selected model belongs to a configured connection and is in the list', () => {
    const settings = settingsStub({
      selectedModelId: 'venice:m',
      connections: [
        connection({
          id: 'venice',
          label: 'Venice',
          type: 'openai-compatible',
          baseUrl: 'https://x/v1',
        }),
      ],
    });
    expect(computeReadiness('ready', settings, false, [model('venice:m', 'venice')])).toBe('ready');
  });

  it('is unconfigured when there are no configured connections and nothing selected', () => {
    expect(
      computeReadiness('ready', settingsStub({ selectedModelId: '', connections: [] }), false, []),
    ).toBe('unconfigured');
  });

  it('is unconfigured when an unconfigured connection exists but nothing is selected', () => {
    const settings = settingsStub({
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: false } })],
    });
    expect(computeReadiness('ready', settings, false, [])).toBe('unconfigured');
  });

  it('is ready for a native-key connection only when its apiKey is set', () => {
    const keyed = settingsStub({
      selectedModelId: 'openai:gpt-4o',
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', keyed, false, [model('openai:gpt-4o', 'openai')])).toBe(
      'ready',
    );
    const unkeyed = settingsStub({
      selectedModelId: 'openai:gpt-4o',
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: false } })],
    });
    expect(computeReadiness('ready', unkeyed, false, [model('openai:gpt-4o', 'openai')])).toBe(
      'model-unavailable',
    );
  });

  it('is ready for azure only with apiKey AND (resourceName OR baseUrl)', () => {
    const withResource = settingsStub({
      selectedModelId: 'az:dep',
      connections: [
        connection({ id: 'az', type: 'azure', apiKey: { isSet: true }, resourceName: 'my-res' }),
      ],
    });
    expect(computeReadiness('ready', withResource, false, [model('az:dep', 'az')])).toBe('ready');
    const withBaseUrl = settingsStub({
      selectedModelId: 'az:dep',
      connections: [
        connection({ id: 'az', type: 'azure', apiKey: { isSet: true }, baseUrl: 'https://az/v1' }),
      ],
    });
    expect(computeReadiness('ready', withBaseUrl, false, [model('az:dep', 'az')])).toBe('ready');
    const keyOnly = settingsStub({
      selectedModelId: 'az:dep',
      connections: [connection({ id: 'az', type: 'azure', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', keyOnly, false, [model('az:dep', 'az')])).toBe(
      'model-unavailable',
    );
  });

  it('is ready for openai-compatible with a baseUrl even when no apiKey is set', () => {
    const settings = settingsStub({
      selectedModelId: 'local:llama',
      connections: [
        connection({ id: 'local', type: 'openai-compatible', baseUrl: 'http://localhost:1234/v1' }),
      ],
    });
    expect(computeReadiness('ready', settings, false, [model('local:llama', 'local')])).toBe(
      'ready',
    );
  });

  it('is model-unavailable when a model is selected but not in the live list', () => {
    const settings = settingsStub({
      selectedModelId: 'openai:gpt-4o',
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', settings, false, [])).toBe('model-unavailable');
  });

  it('is model-unavailable when a connection is configured but no model is selected yet', () => {
    const settings = settingsStub({
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', settings, false, [])).toBe('model-unavailable');
  });

  it('is model-unavailable for a malformed model id with no connection segment', () => {
    const settings = settingsStub({
      selectedModelId: 'gpt-4o',
      connections: [connection({ id: 'openai', type: 'openai', apiKey: { isSet: true } })],
    });
    expect(computeReadiness('ready', settings, false, [model('gpt-4o', 'openai')])).toBe(
      'model-unavailable',
    );
  });

  it('uses an explicit effective model over selectedModelId: in the list and configured -> ready', () => {
    // The settings default points elsewhere; the conversation override (effective model) is venice:m,
    // which IS in the list and whose connection is configured.
    const settings = settingsStub({
      selectedModelId: 'openai:other',
      connections: [
        connection({ id: 'venice', type: 'openai-compatible', baseUrl: 'https://x/v1' }),
      ],
    });
    expect(
      computeReadiness('ready', settings, false, [model('venice:m', 'venice')], 'venice:m'),
    ).toBe('ready');
  });

  it('uses an explicit effective model: not in the list -> model-unavailable even though the default would be ready', () => {
    // The settings default (venice:m) IS in the list and ready, but the conversation is pinned to
    // venice:gone, which is NOT in the live list -> a recoverable model-unavailable, not ready.
    const settings = settingsStub({
      selectedModelId: 'venice:m',
      connections: [
        connection({ id: 'venice', type: 'openai-compatible', baseUrl: 'https://x/v1' }),
      ],
    });
    expect(
      computeReadiness('ready', settings, false, [model('venice:m', 'venice')], 'venice:gone'),
    ).toBe('model-unavailable');
  });
});
