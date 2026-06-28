import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import { serverLogger } from '../logging/logger';
import type { FetchImpl } from '../models/discovery/shared';
import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { createConnectionsRoute } from './connections';

function fakeStore(connections: unknown[]): SettingsStore {
  const data = SettingsSchema.parse({ connections });
  const row: StoredSettings = { data, version: CURRENT_SETTINGS_VERSION };
  return { load: vi.fn(async () => row), save: vi.fn(async () => undefined) };
}

const okFetch = async () => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });

function appWith(store: SettingsStore, fetchImpl: FetchImpl = okFetch) {
  const app = new Hono();
  app.route('/', createConnectionsRoute({ settingsStore: store, testDeps: { fetchImpl } }));
  return app;
}

function post(app: Hono, body: unknown) {
  return app.request('/api/v1/connections/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putSecret(app: Hono, id: string, body: unknown) {
  return app.request(`/api/v1/connections/${id}/secret`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/connections/test', () => {
  it('tests a full connection config and returns ok with a model count', async () => {
    const res = await post(appWith(fakeStore([])), {
      connection: {
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        baseUrl: 'https://x/v1',
      },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, modelCount: 1 });
  });

  it('400s on an invalid request body', async () => {
    const res = await post(appWith(fakeStore([])), { bogus: true });
    expect(res.status).toBe(400);
  });

  it('resolves a saved connection by id', async () => {
    const store = fakeStore([
      { id: 'work', label: 'Work', type: 'openai-compatible', baseUrl: 'https://x/v1' },
    ]);
    const res = await post(appWith(store), { connectionId: 'work' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, modelCount: 1 });
  });

  it('applies an override on top of a stored connection before probing', async () => {
    const seen: { url?: string; headers?: Record<string, string> } = {};
    const spyFetch = async (url: string | URL, init?: RequestInit) => {
      seen.url = String(url);
      seen.headers = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
    };
    const store = fakeStore([
      { id: 'work', label: 'Work', type: 'openai-compatible', baseUrl: 'https://x/v1' },
    ]);
    const res = await post(appWith(store, spyFetch), {
      connectionId: 'work',
      override: { apiKey: 'sk-override' },
    });
    expect(res.status).toBe(200);
    expect(seen.url).toBe('https://x/v1/models');
    expect(seen.headers?.Authorization).toBe('Bearer sk-override');
  });
});

describe('PUT /api/v1/connections/:id/secret', () => {
  it('sets an apiKey on a seeded connection and returns the redacted view', async () => {
    const store = fakeStore([{ id: 'work', label: 'Work', type: 'openai', apiKey: 'old' }]);
    const res = await putSecret(appWith(store), 'work', { apiKey: 'sk-new-value' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      settings: { connections: { id: string; apiKey?: { isSet: boolean } }[] };
    };
    const conn = json.settings.connections.find((c) => c.id === 'work');
    expect(conn?.apiKey).toEqual({ isSet: true });
    expect(JSON.stringify(json)).not.toContain('sk-new-value');
  });

  it('clears a header on a seeded openai-compatible connection', async () => {
    const store = fakeStore([
      {
        id: 'work',
        label: 'Work',
        type: 'openai-compatible',
        baseUrl: 'https://x/v1',
        headers: { 'X-Org': 'secret-org' },
      },
    ]);
    const res = await putSecret(appWith(store), 'work', { headers: { 'X-Org': null } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      settings: { connections: { id: string; headers?: Record<string, unknown> }[] };
    };
    const conn = json.settings.connections.find((c) => c.id === 'work');
    expect(conn?.headers?.['X-Org']).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain('secret-org');
  });

  it('404s with not-found for an unknown id', async () => {
    const res = await putSecret(appWith(fakeStore([])), 'ghost', { apiKey: 'sk-x' });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('not-found');
  });

  it('400s with validation-error for an invalid body', async () => {
    const store = fakeStore([{ id: 'work', label: 'Work', type: 'openai', apiKey: 'old' }]);
    const res = await putSecret(appWith(store), 'work', { apiKey: '' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation-error');
  });

  it('400s with validation-error when headers are patched onto a native-key connection', async () => {
    const store = fakeStore([{ id: 'work', label: 'Work', type: 'openai', apiKey: 'old' }]);
    const res = await putSecret(appWith(store), 'work', { headers: { 'x-foo': 'v' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('validation-error');
    // The header name and value must not leak into the error response.
    expect(JSON.stringify(json)).not.toContain('x-foo');
  });

  it('logs only the connection id on a successful secret PUT (no secret crosses the log)', async () => {
    // Spy the same logger instance the route uses (getLogger returns a singleton per category), so we
    // assert the exact info payload - it must be { id } only, never the apiKey/header/body.
    const infoSpy = vi.spyOn(serverLogger('connections'), 'info');
    try {
      const store = fakeStore([{ id: 'work', label: 'Work', type: 'openai', apiKey: 'old' }]);
      const res = await putSecret(appWith(store), 'work', { apiKey: 'sk-new-value' });
      expect(res.status).toBe(200);
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const updated = calls.find(([msg]) => msg === 'Connection secret updated');
      expect(updated?.[1]).toEqual({ id: 'work' });
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('400s with validation-error for an id with uppercase letters (e.g. Work)', async () => {
    // A 400 validation-error proves the guard short-circuited before the service: if the service
    // were reached with an unknown id it would return 404, not 400.
    const res = await putSecret(appWith(fakeStore([])), 'Work', { apiKey: 'sk-x' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation-error');
  });

  it('400s with validation-error for an id with punctuation/underscore (e.g. a_b)', async () => {
    const res = await putSecret(appWith(fakeStore([])), 'a_b', { apiKey: 'sk-x' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('validation-error');
  });

  it('still resolves a valid slug id through the normal 404 path (guard does not block valid ids)', async () => {
    const res = await putSecret(appWith(fakeStore([])), 'valid-id-123', { apiKey: 'sk-x' });
    // No matching connection in the store, so the service returns not-found - 404, not 400.
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('not-found');
  });

  it('logs only the connection id on an unknown-id secret PUT (warn payload is id-only)', async () => {
    const warnSpy = vi.spyOn(serverLogger('connections'), 'warn');
    try {
      const res = await putSecret(appWith(fakeStore([])), 'ghost', { apiKey: 'sk-x' });
      expect(res.status).toBe(404);
      const calls = warnSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const unknown = calls.find(([msg]) => msg === 'connection secret update for unknown id');
      expect(unknown?.[1]).toEqual({ id: 'ghost' });
    } finally {
      warnSpy.mockRestore();
    }
  });
});
