import { describe, expect, it } from 'vitest';

import { createHealthRoute } from './health';

describe('GET /api/v1/health', () => {
  it('returns ok status, the app version, and logContent false', async () => {
    const app = createHealthRoute({ logContent: false });
    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; logContent: boolean };
    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(body.logContent).toBe(false);
  });

  it('reflects logContent true when content logging is on', async () => {
    const app = createHealthRoute({ logContent: true });
    const body = (await (await app.request('/api/v1/health')).json()) as { logContent: boolean };
    expect(body.logContent).toBe(true);
  });
});
