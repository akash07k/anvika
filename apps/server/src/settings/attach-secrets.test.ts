import { describe, expect, it } from 'vitest';

import { SettingsSchema, type Settings } from '@anvika/shared/settings/schema';

import { attachStoredSecrets } from './attach-secrets';

/** Build a full plaintext Settings object carrying the given connections. */
function settingsWith(connections: unknown[]): Settings {
  return { ...SettingsSchema.parse({}), connections } as Settings;
}

/** Read the connections array off a result for assertions. */
function connectionsOf(result: unknown): Record<string, unknown>[] {
  const record = result as { connections: Record<string, unknown>[] };
  return record.connections;
}

describe('attachStoredSecrets', () => {
  it("preserves a sibling's stored apiKey/headers when another connection is edited", () => {
    const stored = settingsWith([
      { id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' },
      {
        id: 'b',
        type: 'openai-compatible',
        label: 'B',
        baseUrl: 'https://x.test',
        headers: { 'X-Token': 'stored-b' },
      },
    ]);
    const merged = {
      ...stored,
      connections: [
        { id: 'a', type: 'openai', label: 'A New' },
        { id: 'b', type: 'openai-compatible', label: 'B', baseUrl: 'https://x.test' },
      ],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    expect(result[0]?.apiKey).toBe('sk-A');
    expect(result[0]?.label).toBe('A New');
    expect(result[1]?.headers).toEqual({ 'X-Token': 'stored-b' });
  });

  it('leaves a brand-new connection (no stored match) with no apiKey/headers', () => {
    const stored = settingsWith([{ id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' }]);
    const merged = {
      ...stored,
      connections: [{ id: 'new', type: 'anthropic', label: 'New' }],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    expect(result[0]).toEqual({ id: 'new', type: 'anthropic', label: 'New' });
    expect(result[0] && 'apiKey' in result[0]).toBe(false);
    expect(result[0] && 'headers' in result[0]).toBe(false);
  });

  it('SECURITY: strips a sneaked apiKey/headers off an incoming connection (overlay only from stored)', () => {
    const stored = settingsWith([{ id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' }]);
    const merged = {
      ...stored,
      connections: [
        // existing id 'a' tries to overwrite its stored key via the wire - must be ignored.
        { id: 'a', type: 'openai', label: 'A', apiKey: 'sk-INJECTED' },
        // brand-new id smuggling a secret - must end up keyless and header-less.
        {
          id: 'evil',
          type: 'openai-compatible',
          label: 'Evil',
          baseUrl: 'https://x.test',
          apiKey: 'sk-EVIL',
          headers: { Authorization: 'Bearer sneaked' },
        },
      ],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    // existing connection keeps its STORED key, not the injected one.
    expect(result[0]?.apiKey).toBe('sk-A');
    // new connection's smuggled secrets are gone.
    expect(result[1]?.apiKey).toBeUndefined();
    expect(result[1] && 'apiKey' in result[1]).toBe(false);
    expect(result[1] && 'headers' in result[1]).toBe(false);
  });

  it('overlays a stored secret correctly by id (apiKey + headers)', () => {
    const stored = settingsWith([
      {
        id: 'c',
        type: 'openai-compatible',
        label: 'C',
        baseUrl: 'https://x.test',
        apiKey: 'sk-stored',
        headers: { Authorization: 'Bearer stored', 'X-Extra': 'keep-me' },
      },
    ]);
    const merged = {
      ...stored,
      connections: [{ id: 'c', type: 'openai-compatible', label: 'C', baseUrl: 'https://x.test' }],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    expect(result[0]?.apiKey).toBe('sk-stored');
    expect(result[0]?.headers).toEqual({ Authorization: 'Bearer stored', 'X-Extra': 'keep-me' });
  });

  it('returns merged unchanged when connections is missing or not an array', () => {
    const stored = settingsWith([{ id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' }]);
    const noConnections = { announcementPeriodMs: 3000 };
    expect(attachStoredSecrets(noConnections, stored)).toBe(noConnections);

    const notArray = { connections: 'nope' };
    expect(attachStoredSecrets(notArray, stored)).toBe(notArray);
  });

  it('passes a non-record or id-less connection through with secrets stripped', () => {
    const stored = settingsWith([{ id: 'a', type: 'openai', label: 'A', apiKey: 'sk-A' }]);
    const merged = {
      ...stored,
      connections: [42, { type: 'openai', label: 'No id', apiKey: 'sk-leak', headers: { X: 'y' } }],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    expect(result[0]).toBe(42);
    expect(result[1] && 'apiKey' in result[1]).toBe(false);
    expect(result[1] && 'headers' in result[1]).toBe(false);
  });

  it('SECURITY: does not overlay a stored secret when the incoming connection type differs from the stored type', () => {
    // stored: openai connection with an apiKey
    const stored = settingsWith([
      { id: 'work', type: 'openai', label: 'Work', apiKey: 'sk-stored' },
    ]);
    // incoming: same id, but type changed to openai-compatible (no secret on the wire)
    const merged = {
      ...stored,
      connections: [
        { id: 'work', type: 'openai-compatible', label: 'Work', baseUrl: 'https://x/v1' },
      ],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    // the stale openai apiKey must NOT be overlaid onto the openai-compatible connection
    expect(result[0] && 'apiKey' in result[0]).toBe(false);
    expect(JSON.stringify(result)).not.toContain('sk-stored');
  });

  it('overlays the stored secret when the incoming connection has the same id AND same type', () => {
    // same-id + same-type: the normal edit path - stored secret must be preserved
    const stored = settingsWith([
      { id: 'work', type: 'openai', label: 'Work', apiKey: 'sk-stored' },
    ]);
    const merged = {
      ...stored,
      connections: [{ id: 'work', type: 'openai', label: 'Work Updated' }],
    };

    const result = connectionsOf(attachStoredSecrets(merged, stored));
    expect(result[0]?.apiKey).toBe('sk-stored');
    expect(result[0]?.label).toBe('Work Updated');
  });
});
