import { describe, expect, it } from 'vitest';

import { ConnectionDiscoveryStatusSchema, ModelsResponseSchema } from './contracts';

const model = {
  id: 'openai-main:gpt-5',
  providerId: 'openai',
  connectionId: 'openai-main',
  connectionLabel: 'OpenAI',
  displayName: 'GPT-5',
  contextWindow: 400000,
  maxOutputTokens: 128000,
  inputPrice: 1.25,
  outputPrice: 10,
  capabilities: { text: true, reasoning: false },
};

describe('ModelsResponseSchema', () => {
  it('validates a { models } envelope of ModelInfo records', () => {
    expect(ModelsResponseSchema.safeParse({ models: [model] }).success).toBe(true);
    expect(ModelsResponseSchema.safeParse({ models: [] }).success).toBe(true);
  });

  it('rejects a missing models array and a malformed record', () => {
    expect(ModelsResponseSchema.safeParse({}).success).toBe(false);
    expect(ModelsResponseSchema.safeParse({ models: [{ id: 'x' }] }).success).toBe(false);
  });

  it('stamps the USD per-million-tokens price unit by default', () => {
    const parsed = ModelsResponseSchema.parse({ models: [] });
    expect(parsed.priceCurrency).toBe('USD');
    expect(parsed.priceUnit).toBe('perMillionTokens');
  });
});

describe('ConnectionDiscoveryStatusSchema', () => {
  it('accepts each valid outcome', () => {
    for (const outcome of ['ok', 'empty', 'unreachable', 'unauthorized', 'error'] as const) {
      expect(
        ConnectionDiscoveryStatusSchema.parse({ connectionId: 'local', outcome }).outcome,
      ).toBe(outcome);
    }
  });

  it('rejects an unknown outcome and an empty connectionId', () => {
    expect(
      ConnectionDiscoveryStatusSchema.safeParse({ connectionId: 'local', outcome: 'nope' }).success,
    ).toBe(false);
    expect(
      ConnectionDiscoveryStatusSchema.safeParse({ connectionId: '', outcome: 'ok' }).success,
    ).toBe(false);
  });

  it('defaults connectionStatuses to an empty array', () => {
    expect(ModelsResponseSchema.parse({ models: [] }).connectionStatuses).toEqual([]);
  });
});
