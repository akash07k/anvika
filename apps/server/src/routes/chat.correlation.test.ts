import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { REQUEST_ID_HEADER } from '@anvika/shared/chat';

import { serverLogger } from '../logging/logger';
import { createChatRoute } from './chat';
import { appWithMock, validBody } from './chat.testkit';

describe('POST /api/v1/chat correlation and abort wiring', () => {
  it('threads the correlation header into the chat logs for the turn', async () => {
    const infoSpy = vi.spyOn(serverLogger('chat'), 'info');
    try {
      const res = await appWithMock().request('/api/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [REQUEST_ID_HEADER]: 'route42' },
        body: JSON.stringify(validBody),
      });
      await res.text();
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const complete = calls.find(([msg]) => msg === 'stream complete');
      expect(complete?.[1]?.requestId).toBe('route42');
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('wires the request abort signal into the turn (aborted request logs "turn aborted")', async () => {
    const infoSpy = vi.spyOn(serverLogger('chat'), 'info');
    try {
      // A pre-aborted request signal: Hono exposes it as `c.req.raw.signal`, the handler forwards it
      // into `streamChat`, and the SDK's server-side stream consumption reports the turn as aborted.
      // This covers the `abortSignal: c.req.raw.signal` wiring - dropping it would silence this log.
      const res = await appWithMock().request('/api/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
        signal: AbortSignal.abort(),
      });
      await res.text();
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const aborted = calls.find(([msg]) => msg === 'turn aborted');
      expect(aborted).toBeDefined();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('drops an over-long correlation header at the trust boundary (does not log it)', async () => {
    const infoSpy = vi.spyOn(serverLogger('chat'), 'info');
    try {
      const res = await appWithMock().request('/api/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [REQUEST_ID_HEADER]: 'x'.repeat(65) },
        body: JSON.stringify(validBody),
      });
      await res.text();
      const calls = infoSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const complete = calls.find(([msg]) => msg === 'stream complete');
      // The over-long value is bounded out at the boundary, so requestId is undefined (never logged).
      expect(complete?.[1]?.requestId).toBeUndefined();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('stamps the correlation id on the pre-stream "model resolution failed" log', async () => {
    const errorSpy = vi.spyOn(serverLogger('chat'), 'error');
    try {
      const app = new Hono();
      app.route(
        '/',
        createChatRoute({
          resolveModel: () => {
            throw new Error('kaboom');
          },
        }),
      );
      // A failure before `streamChat` runs must still carry the turn id: the client minted/sent the
      // header and will emit `clientError.requestId`, so the server's failure log must correlate.
      const res = await app.request('/api/v1/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [REQUEST_ID_HEADER]: 'preflight9' },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(502);
      const calls = errorSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
      const failed = calls.find(([msg]) => msg === 'model resolution failed');
      expect(failed?.[1]?.requestId).toBe('preflight9');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
