import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { createSettingsRoute } from './settings';

const paths = { settings: '/d/settings.json', secrets: '/d/secrets.json' };

function appWith(initial: StoredSettings | null) {
  let row = initial;
  const store: SettingsStore = {
    load: async () => row,
    save: async (_o, data, version) => {
      row = { data, version };
    },
  };
  return new Hono().route('/', createSettingsRoute({ settingsStore: store, paths }));
}

function appWithStore(store: SettingsStore) {
  return new Hono().route('/', createSettingsRoute({ settingsStore: store, paths }));
}

async function get(app: Hono) {
  return app.request('/api/v1/settings');
}
async function patch(app: Hono, body: unknown) {
  return app.request('/api/v1/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('settings route', () => {
  it('GET returns the redacted defaults at the current version on first run', async () => {
    const res = await get(appWith(null));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: number;
      settings: { connections: unknown[] };
      recovered: boolean;
      paths: typeof paths;
    };
    expect(body.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(body.settings.connections).toEqual([]);
    expect(body.recovered).toBe(false);
    expect(body.paths).toEqual(paths);
  });

  it('GET reports recovered:true when the store read throws', async () => {
    const app = appWithStore({
      load: async () => {
        throw new Error('boom');
      },
      save: async () => undefined,
    });
    const body = (await (await get(app)).json()) as { recovered: boolean };
    expect(body.recovered).toBe(true);
  });

  it('PATCH over an unreadable file without force returns 409 settings-file-invalid', async () => {
    const app = appWithStore({
      load: async () => {
        throw new Error('boom');
      },
      save: async () => undefined,
    });
    const res = await patch(app, {
      connections: [
        { id: 'local', label: 'Local', type: 'openai-compatible', baseUrl: 'http://x/v1' },
      ],
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe('settings-file-invalid');
  });

  it('PATCH with overwriteInvalid=true saves over an unreadable file', async () => {
    let saved = false;
    const app = appWithStore({
      load: async () => {
        throw new Error('boom');
      },
      save: async () => {
        saved = true;
      },
    });
    const res = await app.request('/api/v1/settings?overwriteInvalid=true', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connections: [
          { id: 'local', label: 'Local', type: 'openai-compatible', baseUrl: 'http://x/v1' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    expect(saved).toBe(true);
    expect(((await res.json()) as { recovered: boolean }).recovered).toBe(false);
  });

  it('GET never returns a stored secret in plaintext (only isSet)', async () => {
    const app = appWith({
      data: SettingsSchema.parse({
        connections: [
          { id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'sk-secret' },
        ],
      }),
      version: CURRENT_SETTINGS_VERSION,
    });
    const res = await get(app);
    const text = await res.text();
    expect(text).not.toContain('sk-secret');
    const parsed = JSON.parse(text) as {
      settings: { connections: Array<{ apiKey: { isSet: boolean } }> };
    };
    expect(parsed.settings.connections[0]?.apiKey).toEqual({ isSet: true });
  });

  it('PATCH adds a public connection but strips any secret on the wire (isSet stays false)', async () => {
    const app = appWith(null);
    // A secret sent on the connections array is STRIPPED (Option C: secrets never ride the wire); it
    // stays unset until written via PUT /api/v1/connections/:id/secret. The public connection persists,
    // and an unrelated PATCH must not drop it.
    await patch(app, {
      connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'sk-1' }],
    });
    await patch(app, { announcementPeriodMs: 2500 }); // unrelated; must not drop the connection
    const body = (await (await get(app)).json()) as {
      settings: {
        connections: Array<{ id: string; apiKey: { isSet: boolean } }>;
        announcementPeriodMs: number;
      };
    };
    expect(body.settings.connections[0]?.id).toBe('anthropic');
    expect(body.settings.connections[0]?.apiKey).toEqual({ isSet: false });
    expect(body.settings.announcementPeriodMs).toBe(2500);
  });

  it('PATCH with an invalid value returns a canonical validation-error and persists nothing', async () => {
    const app = appWith(null);
    const res = await patch(app, { announcementPeriodMs: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation-error');
    expect((await (await get(app)).json()).settings.announcementPeriodMs).toBe(2000);
  });

  it('PATCH with a non-object body is a validation-error', async () => {
    const res = await patch(appWith(null), 42);
    expect(res.status).toBe(400);
  });
});
