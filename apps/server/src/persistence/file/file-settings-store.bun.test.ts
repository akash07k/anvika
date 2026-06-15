import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import { FileSettingsStore, SettingsReadError } from './file-settings-store';

/** Walk a nested record tree by key path, returning the leaf (or `undefined`) without using `any`. */
function at(root: unknown, ...path: string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function makeStore(): Promise<FileSettingsStore> {
  dir = await mkdtemp(join(tmpdir(), 'anvika-fs-'));
  return new FileSettingsStore(dir);
}

describe('FileSettingsStore', () => {
  it('returns null when no settings file exists (first run)', async () => {
    const store = await makeStore();
    expect(await store.load('local')).toBeNull();
  });

  it('round-trips and keeps keys out of settings.json', async () => {
    const store = await makeStore();
    const data = SettingsSchema.parse({
      connections: [{ id: 'openai', label: 'OpenAI', type: 'openai', apiKey: 'sk-o' }],
    });
    await store.save('local', data, CURRENT_SETTINGS_VERSION);
    const settingsText = await readFile(join(dir, 'settings.json'), 'utf8');
    const secretsText = await readFile(join(dir, 'secrets.json'), 'utf8');
    expect(settingsText).not.toContain('sk-o');
    expect(secretsText).toContain('sk-o');
    const row = await store.load('local');
    // at() walks object keys; arrays index by string key so '0' resolves the first element.
    expect(at(row?.data, 'connections', '0', 'apiKey')).toBe('sk-o');
    expect(row?.version).toBe(CURRENT_SETTINGS_VERSION);
  });

  it('throws SettingsReadError on a corrupt settings file and does not overwrite it', async () => {
    const store = await makeStore();
    await writeFile(join(dir, 'settings.json'), '{ not json');
    let caught: unknown;
    try {
      await store.load('local');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SettingsReadError);
    expect(await readFile(join(dir, 'settings.json'), 'utf8')).toBe('{ not json');
  });

  it('tolerates a missing secrets.json', async () => {
    const store = await makeStore();
    await store.save('local', SettingsSchema.parse({}), CURRENT_SETTINGS_VERSION);
    await rm(join(dir, 'secrets.json'), { force: true });
    expect(await store.load('local')).not.toBeNull();
  });

  it('writes secrets.json with 0600 permissions (POSIX only)', async () => {
    const store = await makeStore();
    await store.save(
      'local',
      SettingsSchema.parse({
        connections: [{ id: 'openai', label: 'OpenAI', type: 'openai', apiKey: 'sk-o' }],
      }),
      CURRENT_SETTINGS_VERSION,
    );
    if (process.platform !== 'win32') {
      const mode = (await stat(join(dir, 'secrets.json'))).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('throws SettingsReadError on a corrupt secrets.json with a valid settings.json (no clobber)', async () => {
    const store = await makeStore();
    await store.save(
      'local',
      SettingsSchema.parse({
        connections: [{ id: 'openai', label: 'OpenAI', type: 'openai', apiKey: 'sk-o' }],
      }),
      CURRENT_SETTINGS_VERSION,
    );
    await writeFile(join(dir, 'secrets.json'), '{ not json');
    let caught: unknown;
    try {
      await store.load('local');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SettingsReadError);
    expect(await readFile(join(dir, 'secrets.json'), 'utf8')).toBe('{ not json');
  });

  it('throws SettingsReadError when the settings envelope is missing version', async () => {
    const store = await makeStore();
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ settings: {} }));
    let caught: unknown;
    try {
      await store.load('local');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SettingsReadError);
  });

  it('throws SettingsReadError when the settings envelope is not an object', async () => {
    const store = await makeStore();
    await writeFile(join(dir, 'settings.json'), '[]');
    let caught: unknown;
    try {
      await store.load('local');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SettingsReadError);
  });

  it('drops a removed connection secret from secrets.json on save', async () => {
    const store = await makeStore();

    // Save two connections, each with a secret.
    const dataWithBoth = SettingsSchema.parse({
      connections: [
        { id: 'keep', label: 'Keep', type: 'openai', apiKey: 'sk-keep' },
        {
          id: 'drop',
          label: 'Drop',
          type: 'openai-compatible',
          baseUrl: 'https://x/v1',
          apiKey: 'sk-drop',
        },
      ],
    });
    await store.save('local', dataWithBoth, CURRENT_SETTINGS_VERSION);

    // Both secrets must be present after the first save.
    const secretsAfterFirst = await readFile(join(dir, 'secrets.json'), 'utf8');
    expect(secretsAfterFirst).toContain('keep');
    expect(secretsAfterFirst).toContain('sk-keep');
    expect(secretsAfterFirst).toContain('drop');
    expect(secretsAfterFirst).toContain('sk-drop');

    // Save again with only the 'keep' connection; 'drop' is removed.
    const dataKeepOnly = SettingsSchema.parse({
      connections: [{ id: 'keep', label: 'Keep', type: 'openai', apiKey: 'sk-keep' }],
    });
    await store.save('local', dataKeepOnly, CURRENT_SETTINGS_VERSION);

    // The removed connection's secret must be gone; the surviving one must remain.
    const secretsAfterSecond = await readFile(join(dir, 'secrets.json'), 'utf8');
    expect(secretsAfterSecond).not.toContain('sk-drop');
    expect(secretsAfterSecond).not.toContain('"drop"');
    expect(secretsAfterSecond).toContain('sk-keep');

    // Loading must surface only the 'keep' connection with its secret intact.
    const row = await store.load('local');
    const connections = at(row?.data, 'connections');
    expect(Array.isArray(connections)).toBe(true);
    expect((connections as unknown[]).length).toBe(1);
    expect(at(row?.data, 'connections', '0', 'id')).toBe('keep');
    expect(at(row?.data, 'connections', '0', 'apiKey')).toBe('sk-keep');
  });
});
