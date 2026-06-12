import { describe, expect, it } from 'vitest';

import type { TestConfigOverride } from '@anvika/shared/connections/contracts';
import type { Connection } from '@anvika/shared/settings/connection';

import { applyConnectionConfig } from './config-apply';

/** A stored openai-compatible connection with a secret, for overlay assertions. */
function venice(): Connection {
  return {
    id: 'venice',
    type: 'openai-compatible',
    label: 'Venice',
    baseUrl: 'https://x/v1',
    apiKey: 'sk-stored',
  } as Connection;
}

describe('applyConnectionConfig', () => {
  it('overlays a present baseUrl, keeping other fields and the secret', () => {
    const out = applyConnectionConfig(venice(), { baseUrl: 'https://new-host/v1' });
    expect((out as { baseUrl?: string }).baseUrl).toBe('https://new-host/v1');
    expect((out as { apiKey?: string }).apiKey).toBe('sk-stored');
    expect(out.id).toBe('venice');
  });

  it('keeps the stored value when the field is absent from the override', () => {
    const out = applyConnectionConfig(venice(), {});
    expect((out as { baseUrl?: string }).baseUrl).toBe('https://x/v1');
  });

  it('overlays resourceName and apiVersion when present', () => {
    const azure = {
      id: 'az',
      type: 'azure',
      label: 'Az',
      resourceName: 'old-res',
      apiVersion: '2024-01-01',
      apiKey: 'sk',
    } as Connection;
    const cfg: TestConfigOverride = { resourceName: 'new-res', apiVersion: '2025-01-01' };
    const out = applyConnectionConfig(azure, cfg);
    expect((out as { resourceName?: string }).resourceName).toBe('new-res');
    expect((out as { apiVersion?: string }).apiVersion).toBe('2025-01-01');
  });

  it('never mutates the input connection', () => {
    const input = venice();
    applyConnectionConfig(input, { baseUrl: 'https://other/v1' });
    expect((input as { baseUrl?: string }).baseUrl).toBe('https://x/v1');
  });
});
