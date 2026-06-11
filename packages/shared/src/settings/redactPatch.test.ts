import { describe, expect, it } from 'vitest';

import { redactSettingsPatch } from './redactPatch';

describe('redactSettingsPatch (connections)', () => {
  it('redacts a connection apiKey by name, preserving other fields', () => {
    const out = redactSettingsPatch({
      connections: [{ id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk-secret' }],
    }) as { connections: Array<Record<string, unknown>> };
    expect(out.connections[0]).toEqual({
      id: 'work',
      label: 'Work',
      type: 'anthropic',
      apiKey: '[redacted]',
    });
  });

  it('redacts every header value but keeps header keys, and redacts the baseUrl', () => {
    const out = redactSettingsPatch({
      connections: [
        {
          id: 'venice',
          label: 'Venice',
          type: 'openai-compatible',
          baseUrl: 'https://api.venice.ai/api/v1',
          headers: { Authorization: 'Bearer secret', 'x-extra': 'also-secret' },
        },
      ],
    }) as { connections: Array<Record<string, unknown>> };
    const conn = out.connections[0];
    // The base URL is host config (it can reveal a private/LAN host), so it is redacted in logs and
    // its value must NOT survive (this assertion previously, wrongly, asserted it was preserved).
    expect(conn?.baseUrl).toBe('[redacted]');
    expect(conn?.headers).toEqual({ Authorization: '[redacted]', 'x-extra': '[redacted]' });
  });

  it('redacts the azure host fields (baseUrl, resourceName, apiVersion) while keeping id/type/label', () => {
    const out = redactSettingsPatch({
      connections: [
        {
          id: 'az',
          label: 'Azure',
          type: 'azure',
          resourceName: 'my-private-resource',
          apiVersion: '2024-10-21',
          apiKey: 'sk-secret',
        },
      ],
    }) as { connections: Array<Record<string, unknown>> };
    const conn = out.connections[0];
    expect(conn).toEqual({
      id: 'az',
      label: 'Azure',
      type: 'azure',
      resourceName: '[redacted]',
      apiVersion: '[redacted]',
      apiKey: '[redacted]',
    });
    // No host identifier survives anywhere in the serialized log payload.
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('my-private-resource');
  });

  it('passes through non-secret scalars and arrays unchanged', () => {
    expect(redactSettingsPatch({ selectedModelId: 'work:claude' })).toEqual({
      selectedModelId: 'work:claude',
    });
    expect(redactSettingsPatch('plain')).toBe('plain');
    expect(redactSettingsPatch([{ apiKey: 'sk' }, { label: 'x' }])).toEqual([
      { apiKey: '[redacted]' },
      { label: 'x' },
    ]);
  });
});
