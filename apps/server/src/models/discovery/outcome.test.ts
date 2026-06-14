import { describe, expect, it, vi } from 'vitest';

import type { Connection } from '@anvika/shared/settings/connection';

import { resolveDiscoveryOutcome } from './outcome';

const local: Connection = {
  id: 'local',
  type: 'openai-compatible',
  label: 'Local',
  baseUrl: 'http://localhost:1234',
  reasoningEffort: 'inherit',
  enabled: true,
  sendThinkingParams: true,
};
const azure: Connection = {
  id: 'az',
  type: 'azure',
  label: 'Az',
  resourceName: 'r',
  reasoningEffort: 'inherit',
  enabled: true,
};

/**
 * Inject a fetch returning a canned Response (or rejecting for a network failure) so the REAL
 * testConnection categorizer runs end-to-end. More robust than spying an ESM named import.
 */
function fetchReturning(status: number | 'reject', body: unknown = {}) {
  return vi.fn(() =>
    status === 'reject'
      ? Promise.reject(new Error('refused'))
      : Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

describe('resolveDiscoveryOutcome', () => {
  it('returns ok with NO fetch when live discovery already found models', async () => {
    const fetchImpl = fetchReturning('reject');
    expect(await resolveDiscoveryOutcome(local, [{ id: 'a' }], { fetchImpl })).toBe('ok');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns ok with NO fetch for a no-listing type (azure)', async () => {
    const fetchImpl = fetchReturning('reject');
    expect(await resolveDiscoveryOutcome(azure, [], { fetchImpl })).toBe('ok');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a network failure to unreachable', async () => {
    expect(await resolveDiscoveryOutcome(local, [], { fetchImpl: fetchReturning('reject') })).toBe(
      'unreachable',
    );
  });

  it('maps a 401 to unauthorized', async () => {
    expect(await resolveDiscoveryOutcome(local, [], { fetchImpl: fetchReturning(401) })).toBe(
      'unauthorized',
    );
  });

  it('maps a 403 to unauthorized', async () => {
    expect(await resolveDiscoveryOutcome(local, [], { fetchImpl: fetchReturning(403) })).toBe(
      'unauthorized',
    );
  });

  it('maps a 500 to error', async () => {
    // testConnection maps non-2xx (other than 401/403/404) to code 'unknown', which resolves to 'error'
    expect(await resolveDiscoveryOutcome(local, [], { fetchImpl: fetchReturning(500) })).toBe(
      'error',
    );
  });

  it('maps a reachable empty listing (200, no models) to empty', async () => {
    // testConnection: 200 + { data: [] } -> ok with modelCount 0 -> outcome 'empty'
    expect(
      await resolveDiscoveryOutcome(local, [], { fetchImpl: fetchReturning(200, { data: [] }) }),
    ).toBe('empty');
  });

  it('reports unreachable even when manual ids exist (live attempt failed, discovered empty)', async () => {
    const withManual: Connection = { ...local, manualModelIds: ['m'] };
    expect(
      await resolveDiscoveryOutcome(withManual, [], { fetchImpl: fetchReturning('reject') }),
    ).toBe('unreachable');
  });
});
