import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';
import { describe, expect, it } from 'vitest';

import { createApp } from './app';
import type { AssetSource } from './assets/asset-source';
import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SettingsStore,
} from './persistence/ports';

/** A minimal no-op fake satisfying all four id-keyed ports the app now requires. */
const fakeMultiStore: MultiConversationStore &
  IdReasoningOverrideStore &
  IdModelOverrideStore &
  ActiveConversationStore = {
  list: async () => [],
  load: async () => null,
  saveTurn: async () => ({ ok: true, revision: 1 }),
  rename: async () => undefined,
  setPinned: async () => true,
  branch: async () => ({ ok: false, reason: 'not-found' }),
  delete: async () => undefined,
  deleteMany: async () => undefined,
  healMessages: async () => undefined,
  getReasoningOverride: async () => null,
  setReasoningOverride: async () => undefined,
  getModelOverride: async () => null,
  setModelOverride: async () => undefined,
  getActiveId: async () => null,
  setActiveId: async () => undefined,
};

/** A no-op retitle matching {@link RetitleFn}; the app requires it but these tests never call it. */
const fakeRetitle = async (): Promise<string> => 'New conversation';

// An empty `connections` array keeps the models route fully offline: assembly returns `[]` without
// attempting any live discovery fetch (deterministic in unit tests). The stored version is the
// current one, so the settings route still reports the current version.
const fakeSettingsStore: SettingsStore = {
  load: async () => ({
    data: SettingsSchema.parse({ connections: [] }),
    version: CURRENT_SETTINGS_VERSION,
  }),
  save: async () => undefined,
};

/** Build a `createApp` input with the shared fakes, overriding the given fields. */
function appInput(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return {
    assetSource: undefined,
    logContent: false,
    multiConversationStore: fakeMultiStore,
    retitle: fakeRetitle,
    settingsStore: fakeSettingsStore,
    settingsPaths: { settings: 's', secrets: 'x' },
    globalLogOff: false,
    ...overrides,
  };
}

describe('createApp', () => {
  it('serves the health route', async () => {
    const app = createApp(appInput());
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('returns a canonical not-found error for unknown /api routes', async () => {
    const app = createApp(appInput());
    const res = await app.request('/api/v1/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('not-found');
  });

  it('builds with content logging enabled', async () => {
    const app = createApp(appInput({ logContent: true }));
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('serves the conversations list route', async () => {
    const app = createApp(appInput());
    const res = await app.request('/api/v1/conversations');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [], activeId: null });
  });

  it('serves the settings route', async () => {
    const app = createApp(appInput());
    const res = await app.request('/api/v1/settings');
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('serves the models route', async () => {
    const app = createApp(appInput());
    const res = await app.request('/api/v1/models');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      models: [],
      connectionStatuses: [],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
  });

  it('returns 404 with not-found code when AssetSource.resolve returns null', async () => {
    const nullAssetSource: AssetSource = { resolve: () => Promise.resolve(null) };
    const app = createApp(appInput({ assetSource: nullAssetSource }));
    const res = await app.request('/');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('not-found');
  });
});
