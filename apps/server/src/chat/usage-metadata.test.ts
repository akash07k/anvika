import { describe, expect, it } from 'vitest';

import { toUsageMetadata } from './usage-metadata';

const baseStep = {
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    totalTokens: 150,
    inputTokenDetails: { cacheReadTokens: 20, cacheWriteTokens: 0 },
    outputTokenDetails: { reasoningTokens: 10 },
  },
  finishReason: 'stop' as const,
  rawFinishReason: 'stop',
  response: { id: 'resp_1', modelId: 'gpt-4o-2024-08-06', timestamp: new Date(1700000000000) },
};

describe('toUsageMetadata', () => {
  it('maps the finish-step usage, finish reason, resolved id, response fidelity, and price', () => {
    const usage = toUsageMetadata(baseStep, 'openai:gpt-4o', {
      input: 2.5,
      output: 10,
      currency: 'USD',
    });
    expect(usage).toEqual({
      tokens: { input: 100, output: 50, total: 150, cacheRead: 20, cacheWrite: 0, reasoning: 10 },
      finishReason: 'stop',
      rawFinishReason: 'stop',
      modelId: 'openai:gpt-4o',
      providerReportedModelId: 'gpt-4o-2024-08-06',
      responseId: 'resp_1',
      responseAt: 1700000000000,
      price: { input: 2.5, output: 10, currency: 'USD' },
    });
  });

  it('omits price when null and omits token sub-counts the provider did not report', () => {
    const usage = toUsageMetadata(
      {
        usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
        finishReason: 'stop',
        response: { id: 'r', modelId: 'm', timestamp: new Date(1) },
      },
      'local:llama',
      null,
    );
    expect(usage.price).toBeUndefined();
    expect(usage.tokens).toEqual({ input: 5, output: 7, total: 12 });
    expect(usage.modelId).toBe('local:llama');
  });
});
