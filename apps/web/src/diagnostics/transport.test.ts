import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DiagnosticEntry } from '@anvika/shared/diagnostics/events';

import { postDiagnosticBatch } from './transport';

const entries: DiagnosticEntry[] = [
  { seq: 1, at: 1, event: { type: 'milestone', code: 'app-mounted' } },
];

afterEach(() => vi.restoreAllMocks());

describe('postDiagnosticBatch', () => {
  it('returns ok on a 2xx response and posts with keepalive', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await postDiagnosticBatch(entries)).toBe('ok');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.keepalive).toBe(true);
    expect(init.method).toBe('POST');
  });

  it('returns poison on a 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    expect(await postDiagnosticBatch(entries)).toBe('poison');
  });

  it('returns retry on a 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    expect(await postDiagnosticBatch(entries)).toBe('retry');
  });

  it('returns retry and never throws on a network rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(postDiagnosticBatch(entries)).resolves.toBe('retry');
  });
});

describe('postDiagnosticBatch disabled', () => {
  it('returns disabled when the server replies with x-anvika-diagnostics: off', async () => {
    const res = new Response(null, { status: 204, headers: { 'x-anvika-diagnostics': 'off' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    expect(await postDiagnosticBatch(entries)).toBe('disabled');
  });
});
