import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { createRequestLogging, type RequestLogEntry } from './request-logging';

describe('createRequestLogging', () => {
  it('logs method, path, status, and duration after a matched request', async () => {
    const entries: RequestLogEntry[] = [];
    const app = new Hono();
    app.use(
      '/api/*',
      createRequestLogging((entry) => entries.push(entry)),
    );
    app.get('/api/v1/health', (c) => c.json({ ok: true }));

    const res = await app.request('/api/v1/health');
    expect(res.status).toBe(200);

    const first = entries[0];
    expect(first).toBeDefined();
    if (first) {
      expect(first).toMatchObject({ method: 'GET', path: '/api/v1/health', status: 200 });
      expect(first.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('does not log requests that do not match the mounted path', async () => {
    const entries: RequestLogEntry[] = [];
    const app = new Hono();
    app.use(
      '/api/*',
      createRequestLogging((entry) => entries.push(entry)),
    );
    app.get('/other', (c) => c.text('x'));

    await app.request('/other');
    expect(entries).toHaveLength(0);
  });
});
