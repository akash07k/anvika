import { describe, expect, it } from 'vitest';

import { MessageMetadataSchema, UsageMetadataSchema } from './message-metadata';

describe('MessageMetadataSchema', () => {
  it('accepts an epoch-ms createdAt', () => {
    expect(MessageMetadataSchema.parse({ createdAt: 1_749_300_000_000 }).createdAt).toBe(
      1_749_300_000_000,
    );
  });
  it('rejects a missing or negative createdAt', () => {
    expect(() => MessageMetadataSchema.parse({})).toThrow();
    expect(() => MessageMetadataSchema.parse({ createdAt: -1 })).toThrow();
  });
});

describe('UsageMetadataSchema incompleteReason', () => {
  it('accepts the aborted and error markers', () => {
    expect(UsageMetadataSchema.parse({ incompleteReason: 'aborted' }).incompleteReason).toBe(
      'aborted',
    );
    expect(UsageMetadataSchema.parse({ incompleteReason: 'error' }).incompleteReason).toBe('error');
  });

  it('rejects any other marker value', () => {
    expect(() => UsageMetadataSchema.parse({ incompleteReason: 'cancelled' })).toThrow();
  });

  it('leaves incompleteReason undefined when omitted', () => {
    expect(UsageMetadataSchema.parse({}).incompleteReason).toBeUndefined();
  });
});

describe('MessageMetadataSchema reasoningMs', () => {
  it('accepts a non-negative integer reasoningMs and keeps it optional', () => {
    expect(MessageMetadataSchema.parse({ createdAt: 1, reasoningMs: 8000 }).reasoningMs).toBe(8000);
    expect(MessageMetadataSchema.parse({ createdAt: 1 }).reasoningMs).toBeUndefined();
  });

  it('strips unknown provider extras (non-strict object) and rejects a negative reasoningMs', () => {
    const parsed = MessageMetadataSchema.parse({ createdAt: 1, providerJunk: { a: 1 } });
    expect('providerJunk' in parsed).toBe(false);
    expect(MessageMetadataSchema.safeParse({ createdAt: 1, reasoningMs: -5 }).success).toBe(false);
  });
});
