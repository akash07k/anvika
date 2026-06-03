import { HealthResponseSchema } from '@anvika/shared/health';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiClientError, apiDelete, apiGet, apiPatch, apiPatchNoContent } from './api-client';

afterEach(() => vi.restoreAllMocks());

describe('apiGet', () => {
  it('returns parsed JSON on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok', version: '0.0.0', logContent: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = await apiGet('/api/v1/health', HealthResponseSchema);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.0');
  });

  it('throws a typed ApiClientError on a canonical error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'not-found', message: 'nope' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiGet('/api/v1/x', HealthResponseSchema)).rejects.toBeInstanceOf(ApiClientError);
    await expect(apiGet('/api/v1/x', HealthResponseSchema)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('throws a validation-error on a malformed success body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'nope' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiGet('/api/v1/health', HealthResponseSchema)).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(apiGet('/api/v1/health', HealthResponseSchema)).rejects.toMatchObject({
      code: 'validation-error',
    });
  });
});

describe('apiPatch', () => {
  it('PATCHes JSON and validates the response body', async () => {
    const schema = z.object({ version: z.number() });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ version: 1 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await apiPatch('/api/v1/settings', { announcementPeriodMs: 2500 }, schema)).toEqual({
      version: 1,
    });
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const init = calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('PATCH');
  });

  it('throws a canonical ApiClientError on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'validation-error', message: 'bad' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      apiPatch('/api/v1/settings', {}, z.object({ version: z.number() })),
    ).rejects.toMatchObject({ code: 'validation-error' });
  });
});

describe('apiPatchNoContent', () => {
  it('resolves void on a 204 (no body validated)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      apiPatchNoContent('/api/v1/conversations/x', { title: 'New' }),
    ).resolves.toBeUndefined();
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const init = calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('PATCH');
  });

  it('throws a canonical ApiClientError on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'not-found', message: 'gone' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      apiPatchNoContent('/api/v1/conversations/x', { title: 'New' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('apiDelete', () => {
  it('validates the success body against the schema', async () => {
    const schema = z.object({ activeId: z.string().nullable() });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeId: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await apiDelete('/api/v1/conversations/x', schema)).toEqual({ activeId: null });
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const init = calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('DELETE');
  });

  it('returns undefined when no schema is given', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await expect(apiDelete('/api/v1/conversations/x')).resolves.toBeUndefined();
  });

  it('throws a validation-error on a malformed success body', async () => {
    const schema = z.object({ activeId: z.string().nullable() });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ wrong: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiDelete('/api/v1/conversations/x', schema)).rejects.toMatchObject({
      code: 'validation-error',
    });
  });

  it('throws a canonical ApiClientError on a non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'not-found', message: 'gone' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(apiDelete('/api/v1/conversations/x')).rejects.toMatchObject({ code: 'not-found' });
  });
});
