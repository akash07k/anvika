import { describe, expect, it } from 'vitest';

import type { DiagnosticEntry } from '@anvika/shared/diagnostics/events';

import { createLogRoute } from './log';

function post(body: unknown, globalLogOff = false, logContent = false) {
  return createLogRoute({ globalLogOff, logContent }).request('/api/v1/log', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const entry: DiagnosticEntry = {
  seq: 1,
  at: 1_700_000_000_000,
  event: { type: 'milestone', code: 'app-mounted' },
};

describe('POST /api/v1/log', () => {
  it('accepts a valid batch with 204', async () => {
    const res = await post({ entries: [entry] });
    expect(res.status).toBe(204);
  });

  it('rejects an empty batch with the canonical validation error', async () => {
    const res = await post({ entries: [] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('validation-error');
  });

  it('rejects an oversized batch (over 100 entries)', async () => {
    const res = await post({ entries: Array.from({ length: 101 }, () => entry) });
    expect(res.status).toBe(400);
  });

  it('rejects a free-form field smuggled onto an event', async () => {
    const res = await post({
      entries: [
        {
          seq: 1,
          at: 1,
          event: { type: 'focusOutcome', domId: 'x', outcome: 'focused', prompt: 'leak' },
        },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not the batch shape', async () => {
    const res = await post({ level: 'info', event: 'app-mounted' });
    expect(res.status).toBe(400);
  });

  it('rejects the whole batch when any single entry is invalid', async () => {
    const bad = {
      seq: 2,
      at: 2,
      event: { type: 'focusOutcome', domId: 'x', outcome: 'not-a-real-outcome' },
    };
    const res = await post({ entries: [entry, bad] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/log off header', () => {
  it('sets x-anvika-diagnostics: off on the 204 when globally off', async () => {
    const res = await post({ entries: [entry] }, true);
    expect(res.status).toBe(204);
    expect(res.headers.get('x-anvika-diagnostics')).toBe('off');
  });

  it('omits the header when not globally off', async () => {
    const res = await post({ entries: [entry] }, false);
    expect(res.status).toBe(204);
    expect(res.headers.get('x-anvika-diagnostics')).toBeNull();
  });
});
