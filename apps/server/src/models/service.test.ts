import { describe, expect, it } from 'vitest';

import { SettingsSchema } from '@anvika/shared/settings/schema';

import { assembleAvailableModels, assembleModelsAndStatuses } from './service';

const fetchSuccess = async () =>
  new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b' }] }), { status: 200 });

const fetchFailure = async () => new Response('x', { status: 500 });

/** good->200, bad->throws, everything else (models.dev)->500 (fail-soft to snapshot). */
const dispatchFetch = async (url: string, _init: RequestInit): Promise<Response> => {
  if (url === 'https://good/v1/models') {
    return new Response(JSON.stringify({ data: [{ id: 'disc-good' }] }), { status: 200 });
  }
  if (url === 'https://bad/v1/models') {
    throw new Error('network down');
  }
  return new Response('x', { status: 500 });
};

/** Two discovered models for the dedup test; 500 elsewhere so enrichment degrades to snapshot. */
const dupFetch = async (url: string, _init: RequestInit): Promise<Response> => {
  if (url === 'https://conn/v1/models') {
    return new Response(JSON.stringify({ data: [{ id: 'dup' }, { id: 'disc-only' }] }), {
      status: 200,
    });
  }
  return new Response('x', { status: 500 });
};

describe('assembleAvailableModels (connections)', () => {
  it('lists discovered + manual models per connection, tagged with connectionId/label', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'venice',
          label: 'Venice AI',
          type: 'openai-compatible',
          baseUrl: 'https://api.venice.ai/api/v1',
          manualModelIds: ['hand-added'],
        },
      ],
    });
    const models = await assembleAvailableModels(settings, { fetchImpl: fetchSuccess });
    const ids = models.map((m) => m.id).toSorted();
    expect(ids).toEqual(['venice:hand-added', 'venice:llama-3.3-70b']);
    expect(models[0]?.connectionId).toBe('venice');
    expect(models[0]?.connectionLabel).toBe('Venice AI');
    expect(models[0]?.providerId).toBe('openai-compatible');
  });

  it('degrades to manual ids when discovery fails', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'venice',
          label: 'Venice',
          type: 'openai-compatible',
          baseUrl: 'https://x/v1',
          manualModelIds: ['m'],
        },
      ],
    });
    const models = await assembleAvailableModels(settings, { fetchImpl: fetchFailure });
    expect(models.map((m) => m.id)).toEqual(['venice:m']);
  });

  it('fail-soft isolation: one connection discovery failure does not suppress the other connection', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'good',
          label: 'Good',
          type: 'openai-compatible',
          baseUrl: 'https://good/v1',
          manualModelIds: ['manual-good'],
        },
        {
          id: 'bad',
          label: 'Bad',
          type: 'openai-compatible',
          baseUrl: 'https://bad/v1',
          manualModelIds: ['manual-bad'],
        },
      ],
    });
    const models = await assembleAvailableModels(settings, { fetchImpl: dispatchFetch });
    const ids = models.map((m) => m.id).toSorted();
    expect(ids).toContain('good:disc-good');
    expect(ids).toContain('good:manual-good');
    expect(ids).toContain('bad:manual-bad');
    expect(ids).not.toContain('bad:disc-good');
    expect(ids).not.toContain('good:manual-bad');
  });

  it('stamps capabilities.reasoning from the registry: true for a reasoning model, false otherwise', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'anth',
          label: 'Anthropic',
          type: 'anthropic',
          apiKey: 'sk',
          manualModelIds: ['claude-sonnet-4-5-20250929', 'claude-2'],
        },
      ],
    });
    const models = await assembleAvailableModels(settings, {
      fetchImpl: async () => new Response('x', { status: 500 }),
    });
    const byId = new Map(models.map((m) => [m.id, m]));
    expect(byId.get('anth:claude-sonnet-4-5-20250929')?.capabilities.reasoning).toBe(true);
    expect(byId.get('anth:claude-2')?.capabilities.reasoning).toBe(false);
    expect(byId.get('anth:claude-2')?.capabilities.text).toBe(true);
  });

  it('dedup: a manual id that duplicates a discovered id appears exactly once', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'conn',
          label: 'Conn',
          type: 'openai-compatible',
          baseUrl: 'https://conn/v1',
          manualModelIds: ['dup', 'unique-manual'],
        },
      ],
    });

    const models = await assembleAvailableModels(settings, { fetchImpl: dupFetch });
    const ids = models.map((m) => m.id).toSorted();
    const dupCount = ids.filter((id) => id === 'conn:dup').length;

    expect(dupCount).toBe(1);
    expect(ids).toContain('conn:disc-only');
    expect(ids).toContain('conn:unique-manual');
  });
});

const fetchEmpty = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });

const fetchRefused = async (): Promise<Response> => Promise.reject(new Error('refused'));

/** Discovered models for `https://on/v1/models` only; 500 elsewhere (models.dev degrades gracefully). */
const fetchOnlyOn = async (url: string, _init: RequestInit): Promise<Response> =>
  url === 'https://on/v1/models'
    ? new Response(JSON.stringify({ data: [{ id: 'on-disc' }] }), { status: 200 })
    : new Response('x', { status: 500 });

describe('assembleModelsAndStatuses', () => {
  it('skips disabled connections entirely (no models, no status)', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'muted',
          label: 'Muted',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:9',
          enabled: false,
        },
      ],
    });
    const { models, connectionStatuses } = await assembleModelsAndStatuses(settings, {
      fetchImpl: fetchEmpty,
    });
    expect(models).toEqual([]);
    expect(connectionStatuses).toEqual([]);
  });

  it('returns one status per enabled connection and never throws on discovery failure', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'local',
          label: 'Local',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:1234',
          enabled: true,
        },
      ],
    });
    const { connectionStatuses } = await assembleModelsAndStatuses(settings, {
      fetchImpl: fetchRefused,
    });
    expect(connectionStatuses).toEqual([{ connectionId: 'local', outcome: 'unreachable' }]);
  });

  it('mixed enabled/disabled: only the enabled connection contributes models and a status', async () => {
    const settings = SettingsSchema.parse({
      connections: [
        {
          id: 'on',
          label: 'On',
          type: 'openai-compatible',
          baseUrl: 'https://on/v1',
          manualModelIds: ['on-manual'],
          enabled: true,
        },
        {
          id: 'off',
          label: 'Off',
          type: 'openai-compatible',
          baseUrl: 'https://off/v1',
          manualModelIds: ['off-manual'],
          enabled: false,
        },
      ],
    });
    const { models, connectionStatuses } = await assembleModelsAndStatuses(settings, {
      fetchImpl: fetchOnlyOn,
    });
    expect(connectionStatuses).toHaveLength(1);
    expect(connectionStatuses[0]?.connectionId).toBe('on');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('on:on-disc');
    expect(ids).toContain('on:on-manual');
    expect(ids.some((id) => id.startsWith('off:'))).toBe(false);
  });
});
