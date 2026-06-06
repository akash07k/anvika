import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';

import { CURRENT_SETTINGS_VERSION } from '@anvika/shared/settings/schema';

import { createConnectionsRoute } from '../../routes/connections';
import { createSettingsRoute } from '../../routes/settings';
import { FileSettingsStore } from './file-settings-store';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

async function makeApp() {
  dir = await mkdtemp(join(tmpdir(), 'anvika-settings-'));
  const store = new FileSettingsStore(dir);
  return new Hono()
    .route('/', createSettingsRoute({ settingsStore: store, paths: store.paths }))
    .route('/', createConnectionsRoute({ settingsStore: store }));
}

describe('settings integration (file store + route)', () => {
  test('PATCH + secret PUT persist through the file store and GET restores them, secret write-only', async () => {
    const app = await makeApp();

    // The connection's PUBLIC config rides the settings PATCH (Option C: no secret on the wire).
    const patched = await app.request('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        announcementPeriodMs: 3000,
        connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic' }],
      }),
    });
    expect(patched.status).toBe(200);

    // The secret rides its own channel: PUT /api/v1/connections/:id/secret, persisted to secrets.json.
    const secretRes = await app.request('/api/v1/connections/anthropic/secret', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-real' }),
    });
    expect(secretRes.status).toBe(200);

    const res = await app.request('/api/v1/settings');
    const text = await res.text();
    expect(text).not.toContain('sk-real'); // secret never leaves the server
    const body = JSON.parse(text) as {
      version: number;
      settings: {
        announcementPeriodMs: number;
        connections: Array<{ id: string; apiKey: { isSet: boolean } }>;
      };
      recovered: boolean;
      paths: { settings: string; secrets: string };
    };
    expect(body.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(body.settings.announcementPeriodMs).toBe(3000); // round-tripped through the JSON files
    expect(body.settings.connections[0]?.apiKey).toEqual({ isSet: true });
    expect(body.recovered).toBe(false);
    expect(body.paths.settings).toContain('settings.json');
  });
});
