import { describe, expect, it } from 'vitest';

import { MessageMetadataSchema } from './message-metadata';

describe('MessageMetadataSchema usage block', () => {
  it('accepts metadata with no usage block (createdAt only)', () => {
    expect(MessageMetadataSchema.safeParse({ createdAt: 1 }).success).toBe(true);
  });

  it('accepts a full usage block', () => {
    const r = MessageMetadataSchema.safeParse({
      createdAt: 1,
      usage: {
        tokens: { input: 10, output: 20, total: 30, cacheRead: 2, cacheWrite: 0, reasoning: 5 },
        finishReason: 'stop',
        modelId: 'openai:gpt-4o',
        providerReportedModelId: 'gpt-4o-2024-08-06',
        responseId: 'resp_1',
        responseAt: 1700000000000,
        price: { input: 2.5, output: 10, currency: 'USD' },
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a partial usage block (some token fields absent)', () => {
    expect(
      MessageMetadataSchema.safeParse({ createdAt: 1, usage: { tokens: { total: 30 } } }).success,
    ).toBe(true);
  });

  it('rejects an unknown finishReason and a negative token count', () => {
    expect(
      MessageMetadataSchema.safeParse({ createdAt: 1, usage: { finishReason: 'nope' } }).success,
    ).toBe(false);
    expect(
      MessageMetadataSchema.safeParse({ createdAt: 1, usage: { tokens: { input: -1 } } }).success,
    ).toBe(false);
  });

  it('rejects a price with a non-USD currency', () => {
    expect(
      MessageMetadataSchema.safeParse({
        createdAt: 1,
        usage: { price: { input: 1, output: 2, currency: 'EUR' } },
      }).success,
    ).toBe(false);
  });
});
