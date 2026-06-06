import { describe, expect, it, vi } from 'vitest';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import type { SettingsStore, StoredSettings } from '../persistence/ports';
import { loadSettings, patchSettings } from './service';

const throwing: SettingsStore = {
  load: async () => {
    throw new Error('boom');
  },
  save: async () => undefined,
};

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

describe('loadSettings', () => {
  it('returns schema defaults at the current version without writing on first run', async () => {
    const store = fakeStore(null);
    const { version, settings } = await loadSettings(store, 'local');
    expect(version).toBe(CURRENT_SETTINGS_VERSION);
    expect(settings.announcementPeriodMs).toBe(2000);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('migrates and validates a stored row', async () => {
    const store = fakeStore({ data: { announcementPeriodMs: 3000 }, version: 1 });
    const { settings } = await loadSettings(store, 'local');
    expect(settings.announcementPeriodMs).toBe(3000);
  });

  it('fails soft to defaults when the stored row is corrupt (logs, no values)', async () => {
    const store = fakeStore({ data: { announcementPeriodMs: 'nope' }, version: 1 });
    const { settings } = await loadSettings(store, 'local');
    expect(settings.announcementPeriodMs).toBe(2000);
  });

  it('first run is not recovered', async () => {
    const store = fakeStore(null);
    expect((await loadSettings(store, 'local')).recovered).toBe(false);
  });

  it('a read failure is recovered (defaults)', async () => {
    const r = await loadSettings(throwing, 'local');
    expect(r.recovered).toBe(true);
    expect(r.settings).toEqual(SettingsSchema.parse({}));
  });

  it('an unparseable row is recovered (defaults)', async () => {
    const store = fakeStore({ data: { announcementPeriodMs: 'nope' }, version: 1 });
    expect((await loadSettings(store, 'local')).recovered).toBe(true);
  });
});

describe('loadSettings version-range guard', () => {
  it('fails soft to defaults (recovered) when the stored version exceeds the current version', async () => {
    const data = SettingsSchema.parse({});
    const store = fakeStore({ data, version: CURRENT_SETTINGS_VERSION + 1 });
    const loaded = await loadSettings(store, 'local');
    expect(loaded.recovered).toBe(true);
    expect(loaded.version).toBe(CURRENT_SETTINGS_VERSION);
    expect(loaded.settings).toEqual(SettingsSchema.parse({}));
  });

  it('fails soft to defaults when the stored version is not a positive integer', async () => {
    const data = SettingsSchema.parse({});
    // The guard's first clause (`!Number.isInteger`) exists to reject hostile values that a
    // hand-edited settings file can put on disk: non-integers, non-finite numbers, and
    // non-number runtime values that slip past a permissive read. Exercise all of them.
    const badVersions: unknown[] = [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '1',
      null,
      undefined,
    ];
    for (const bad of badVersions) {
      const store = fakeStore({ data, version: bad as number });
      const loaded = await loadSettings(store, 'local');
      expect(loaded.recovered).toBe(true);
      expect(loaded.version).toBe(CURRENT_SETTINGS_VERSION);
    }
  });

  it('loads a row stored at the current version normally', async () => {
    const data = SettingsSchema.parse({ announcementPeriodMs: 3500 });
    const store = fakeStore({ data, version: CURRENT_SETTINGS_VERSION });
    const loaded = await loadSettings(store, 'local');
    expect(loaded.recovered).toBe(false);
    expect(loaded.settings.announcementPeriodMs).toBe(3500);
  });
});

describe('patchSettings', () => {
  it('merges, validates, and saves at the current version; returns the new settings', async () => {
    const store = fakeStore(null);
    const result = await patchSettings(store, 'local', { announcementPeriodMs: 2500 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.announcementPeriodMs).toBe(2500);
    expect(store.save).toHaveBeenCalledWith(
      'local',
      expect.objectContaining({ announcementPeriodMs: 2500 }),
      CURRENT_SETTINGS_VERSION,
    );
  });

  it('returns ok:false with issues and persists nothing when the merged result is invalid', async () => {
    const store = fakeStore(null);
    const result = await patchSettings(store, 'local', { announcementPeriodMs: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('validation');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('refuses when on-disk settings are invalid and not forced', async () => {
    const r = await patchSettings(throwing, 'local', { announcementPeriodMs: 3000 });
    expect(r).toEqual({ ok: false, reason: 'file-invalid' });
  });

  it('refuses to overwrite a row stored at a too-new version unless forced', async () => {
    // The version-range guard makes loadSettings return recovered:true for a row written by a
    // newer build; patchSettings must then refuse rather than clobber that file (the downstream
    // half of the trust boundary).
    const store = fakeStore({
      data: SettingsSchema.parse({}),
      version: CURRENT_SETTINGS_VERSION + 1,
    });
    const r = await patchSettings(store, 'local', { announcementPeriodMs: 3000 });
    expect(r).toEqual({ ok: false, reason: 'file-invalid' });
    expect(store.save).not.toHaveBeenCalled();
  });

  it('saves when forced over an invalid file', async () => {
    let saved = false;
    const store: SettingsStore = {
      load: async () => {
        throw new Error('boom');
      },
      save: async () => {
        saved = true;
      },
    };
    const r = await patchSettings(
      store,
      'local',
      { announcementPeriodMs: 3000 },
      { overwriteInvalid: true },
    );
    expect(r.ok).toBe(true);
    expect(saved).toBe(true);
  });

  it('stamps inrPerUsdUpdatedAt when a patch sets inrPerUsd without its own timestamp', async () => {
    const store = fakeStore(null);
    const result = await patchSettings(
      store,
      'local',
      { inrPerUsd: 84 },
      { now: () => 1_700_000_000_000 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.inrPerUsdUpdatedAt).toBe(1_700_000_000_000);
  });

  it('does not overwrite an inrPerUsdUpdatedAt the patch already carries', async () => {
    const store = fakeStore(null);
    const result = await patchSettings(
      store,
      'local',
      { inrPerUsd: 84, inrPerUsdUpdatedAt: 111 },
      { now: () => 999 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.inrPerUsdUpdatedAt).toBe(111);
  });

  it('re-attaches stored secrets by id and strips any secret sneaked onto the connections wire', async () => {
    const stored = {
      ...SettingsSchema.parse({}),
      connections: [
        { id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' },
        { id: 'b', type: 'anthropic', label: 'B', apiKey: 'sk-B' },
      ],
    };
    const store = fakeStore({ data: stored, version: CURRENT_SETTINGS_VERSION });

    const result = await patchSettings(store, 'local', {
      connections: [
        // sibling resent as pure public config (no secret) - keeps its stored key.
        { id: 'a', type: 'openai', label: 'A renamed' },
        // attempt to overwrite a stored key via the wire - must be ignored (stored key wins).
        { id: 'b', type: 'anthropic', label: 'B', apiKey: 'sk-INJECTED' },
        // brand-new connection smuggling a secret - must be saved keyless.
        { id: 'c', type: 'openai', label: 'C', apiKey: 'sk-NEW' },
      ],
    });

    expect(result.ok).toBe(true);
    const lastSaved = store.saved.at(-1);
    expect(lastSaved).toBeDefined();
    const data = lastSaved?.data as {
      connections: { id: string; label?: string; apiKey?: string }[];
    };
    const connections = data.connections;
    expect(connections.find((c) => c.id === 'a')?.apiKey).toBe('sk-A');
    expect(connections.find((c) => c.id === 'a')?.label).toBe('A renamed');
    expect(connections.find((c) => c.id === 'b')?.apiKey).toBe('sk-B');
    expect(connections.find((c) => c.id === 'c')?.apiKey).toBeUndefined();
  });
});
