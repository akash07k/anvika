import { describe, expect, it } from 'vitest';

import {
  SetConnectionSecretSchema,
  TestConnectionRequestSchema,
  TestConnectionResponseSchema,
} from './contracts';

describe('test-connection contracts', () => {
  it('accepts a saved-connection reference or a full config', () => {
    expect(TestConnectionRequestSchema.safeParse({ connectionId: 'work' }).success).toBe(true);
    expect(
      TestConnectionRequestSchema.safeParse({
        connection: { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk' },
      }).success,
    ).toBe(true);
  });

  it('accepts a connectionId with an optional override', () => {
    expect(TestConnectionRequestSchema.safeParse({ connectionId: 'c1' }).success).toBe(true);
    expect(
      TestConnectionRequestSchema.safeParse({ connectionId: 'c1', override: { apiKey: 'k' } })
        .success,
    ).toBe(true);
  });

  it('rejects an empty connectionId', () => {
    expect(TestConnectionRequestSchema.safeParse({ connectionId: '' }).success).toBe(false);
  });

  it('validates a content-safe result', () => {
    expect(TestConnectionResponseSchema.safeParse({ ok: true, modelCount: 3 }).success).toBe(true);
    expect(
      TestConnectionResponseSchema.safeParse({
        ok: false,
        error: { code: 'unauthorized', message: 'Unauthorized' },
      }).success,
    ).toBe(true);
    expect(
      TestConnectionResponseSchema.safeParse({ ok: false, error: { code: 'nope', message: 'x' } })
        .success,
    ).toBe(false);
  });
});

describe('SetConnectionSecretSchema', () => {
  it('parses a no-op patch (empty object)', () => {
    expect(SetConnectionSecretSchema.safeParse({}).success).toBe(true);
  });

  it('parses a patch that sets apiKey', () => {
    expect(SetConnectionSecretSchema.safeParse({ apiKey: 'k' }).success).toBe(true);
  });

  it('parses a patch that clears apiKey with null', () => {
    expect(SetConnectionSecretSchema.safeParse({ apiKey: null }).success).toBe(true);
  });

  it('parses a patch with header set and header clear', () => {
    expect(
      SetConnectionSecretSchema.safeParse({
        headers: { Authorization: 'v', 'X-Old': null },
      }).success,
    ).toBe(true);
  });

  it('rejects an empty-string apiKey', () => {
    expect(SetConnectionSecretSchema.safeParse({ apiKey: '' }).success).toBe(false);
  });

  it('rejects a header with an empty key', () => {
    expect(SetConnectionSecretSchema.safeParse({ headers: { '': 'v' } }).success).toBe(false);
  });

  it('rejects a header with an empty value (non-null)', () => {
    expect(SetConnectionSecretSchema.safeParse({ headers: { K: '' } }).success).toBe(false);
  });
});
