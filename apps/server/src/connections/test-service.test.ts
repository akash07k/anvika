import { describe, expect, it } from 'vitest';

import { SettingsSchema, type Settings } from '@anvika/shared/settings/schema';

import type { FetchImpl } from '../models/discovery/shared';
import { testConnection } from './test-service';

const venice = {
  id: 'venice',
  label: 'Venice',
  type: 'openai-compatible',
  reasoningEffort: 'inherit',
  enabled: true,
  baseUrl: 'https://x/v1',
  sendThinkingParams: true,
} as const;

/** Build full settings carrying the given connections (to resolve a `connectionId`). */
function settingsWith(connections: unknown[]): Settings {
  return { ...SettingsSchema.parse({}), connections } as Settings;
}

/** A fetch double that records the headers it receives and returns a model listing. */
function recordingFetch(): {
  fetchImpl: FetchImpl;
  calls: { url: string; headers: Record<string, string> }[];
} {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl: FetchImpl = async (url, init) => {
    calls.push({ url, headers: { ...(init.headers as Record<string, string> | undefined) } });
    return new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
  };
  return { calls, fetchImpl };
}

const list200 = async () => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { status: 200 });
const status401 = async () => new Response('no', { status: 401 });
const status404 = async () => new Response('not found', { status: 404 });
const status500 = async () => new Response('boom', { status: 500 });
const throwNetwork = async () => {
  throw new Error('ECONNREFUSED');
};

describe('testConnection', () => {
  it('ok with modelCount on a reachable list', async () => {
    expect(await testConnection({ connection: venice }, { fetchImpl: list200 })).toEqual({
      ok: true,
      modelCount: 1,
    });
  });

  it('unauthorized on 401', async () => {
    const res = await testConnection({ connection: venice }, { fetchImpl: status401 });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('unauthorized');
  });

  it('ok with modelCount 0 when reachable but no listing (404)', async () => {
    expect(await testConnection({ connection: venice }, { fetchImpl: status404 })).toEqual({
      ok: true,
      modelCount: 0,
    });
  });

  it('unreachable on a network error', async () => {
    const res = await testConnection({ connection: venice }, { fetchImpl: throwNetwork });
    expect(res.error?.code).toBe('unreachable');
  });

  it('probes the stored connection by id when no override is given', async () => {
    const settings = settingsWith([
      { id: 'venice', type: 'openai-compatible', label: 'Venice', baseUrl: 'https://x/v1' },
    ]);
    const { fetchImpl, calls } = recordingFetch();

    const res = await testConnection({ connectionId: 'venice' }, { settings, fetchImpl });

    expect(res).toEqual({ ok: true, modelCount: 1 });
    expect(calls[0]?.url).toBe('https://x/v1/models');
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it('applies a { connectionId, override } secret over the stored connection before probing', async () => {
    const settings = settingsWith([
      {
        id: 'venice',
        type: 'openai-compatible',
        label: 'Venice',
        baseUrl: 'https://x/v1',
        apiKey: 'sk-stored',
      },
    ]);
    const { fetchImpl, calls } = recordingFetch();

    const res = await testConnection(
      { connectionId: 'venice', override: { apiKey: 'sk-override' } },
      { settings, fetchImpl },
    );

    expect(res).toEqual({ ok: true, modelCount: 1 });
    // The probe reflects the OVERRIDE key, not the stored one.
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-override');
  });

  it('probes a { connectionId, config } baseUrl edit with the STORED key (no override)', async () => {
    const settings = settingsWith([
      {
        id: 'venice',
        type: 'openai-compatible',
        label: 'Venice',
        baseUrl: 'https://x/v1',
        apiKey: 'sk-stored',
      },
    ]);
    const { fetchImpl, calls } = recordingFetch();

    const res = await testConnection(
      { connectionId: 'venice', config: { baseUrl: 'https://new-host/v1' } },
      { settings, fetchImpl },
    );

    expect(res).toEqual({ ok: true, modelCount: 1 });
    // The probe reflects the NEW baseUrl while still carrying the STORED key.
    expect(calls[0]?.url).toBe('https://new-host/v1/models');
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-stored');
  });

  it('applies config AND override together (new baseUrl + re-typed key)', async () => {
    const settings = settingsWith([
      {
        id: 'venice',
        type: 'openai-compatible',
        label: 'Venice',
        baseUrl: 'https://x/v1',
        apiKey: 'sk-stored',
      },
    ]);
    const { fetchImpl, calls } = recordingFetch();

    const res = await testConnection(
      {
        connectionId: 'venice',
        config: { baseUrl: 'https://new-host/v1' },
        override: { apiKey: 'sk-override' },
      },
      { settings, fetchImpl },
    );

    expect(res).toEqual({ ok: true, modelCount: 1 });
    expect(calls[0]?.url).toBe('https://new-host/v1/models');
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-override');
  });

  it('bad-config when the connectionId is unknown', async () => {
    const settings = settingsWith([]);
    const res = await testConnection({ connectionId: 'missing' }, { settings, fetchImpl: list200 });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('bad-config');
  });

  it('unknown on a generic 5xx (not 401/403/404)', async () => {
    const res = await testConnection({ connection: venice }, { fetchImpl: status500 });
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe('unknown');
    // The message carries only the status number (no secret), which is content-safe.
    expect(res.error?.message).toContain('500');
  });
});
