import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { setConnectionSecret } from './secret-service';

function fakeStore(initial: StoredSettings | null): SettingsStore & {
  saved: StoredSettings[];
  load: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  const saved: StoredSettings[] = [];
  let row = initial;
  return {
    saved,
    load: vi.fn(async () => row),
    save: vi.fn(async (_owner, data, version) => {
      row = { data, version };
      saved.push(row);
    }),
  };
}

function seeded(): StoredSettings {
  const data = {
    ...SettingsSchema.parse({}),
    connections: [
      {
        id: 'c',
        type: 'openai-compatible',
        label: 'C',
        baseUrl: 'https://x/v1',
        headers: { 'x-one': '1' },
      },
      { id: 'a', type: 'anthropic', label: 'A', apiKey: 'sk-A' },
    ],
  };
  return { data, version: CURRENT_SETTINGS_VERSION };
}

type Conn = { id: string; apiKey?: string; headers?: Record<string, string> };

function savedConnections(store: ReturnType<typeof fakeStore>): Conn[] {
  const last = store.saved.at(-1);
  expect(last).toBeDefined();
  return ((last as StoredSettings).data as { connections: Conn[] }).connections;
}

describe('setConnectionSecret', () => {
  it('sets an apiKey on the target connection and leaves siblings untouched', async () => {
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'a', { apiKey: 'sk-A2' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.version).toBe(CURRENT_SETTINGS_VERSION);
    const conns = savedConnections(store);
    expect(conns.find((c) => c.id === 'a')?.apiKey).toBe('sk-A2');
    expect(conns.find((c) => c.id === 'c')?.headers).toEqual({ 'x-one': '1' });
    expect(store.save).toHaveBeenCalledWith('local', expect.anything(), CURRENT_SETTINGS_VERSION);
  });

  it('sets a new header and clears an existing one on the same connection', async () => {
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'c', {
      headers: { 'x-two': '2', 'x-one': null },
    });

    expect(result.ok).toBe(true);
    const conns = savedConnections(store);
    expect(conns.find((c) => c.id === 'c')?.headers).toEqual({ 'x-two': '2' });
  });

  it('returns not-found for an unknown id and persists nothing', async () => {
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'nope', { apiKey: 'sk' });

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('rejects a headers patch on a native-key connection without leaking the header name or value', async () => {
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'a', {
      headers: { 'x-foo': 'v' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation');
      if (result.reason === 'validation') {
        // Content-safety: neither the patched header name nor its value crosses the issue.
        const serialized = JSON.stringify(result.issues);
        expect(serialized).not.toContain('x-foo');
        expect(serialized).not.toContain('"v"');
        expect(result.issues[0]?.path).toEqual(['headers']);
      }
    }
    expect(store.save).not.toHaveBeenCalled();
  });

  it('still allows a headers patch on an openai-compatible connection', async () => {
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'c', {
      headers: { 'x-three': '3' },
    });

    expect(result.ok).toBe(true);
    const conns = savedConnections(store);
    expect(conns.find((c) => c.id === 'c')?.headers).toEqual({ 'x-one': '1', 'x-three': '3' });
  });

  it('returns a validation failure when the patch yields an invalid connection, persisting nothing', async () => {
    // An empty-string apiKey is rejected by the connection schema (`apiKey: z.string().min(1)`).
    // The route validates the patch against SetConnectionSecretSchema (which forbids ''), but the
    // service still defends the WHOLE settings object against any candidate that does not parse.
    const store = fakeStore(seeded());
    const result = await setConnectionSecret(store, 'local', 'a', {
      apiKey: '' as unknown as string,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('validation');
      if (result.reason === 'validation') expect(result.issues.length).toBeGreaterThan(0);
    }
    expect(store.save).not.toHaveBeenCalled();
  });
});
