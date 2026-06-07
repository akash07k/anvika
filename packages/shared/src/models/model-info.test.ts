import { describe, expect, it } from 'vitest';

import { MODEL_PROVIDER_IDS, ModelCapabilitiesSchema, ModelInfoSchema } from './model-info';

const valid = {
  id: 'anthropic-main:claude-opus-4-5',
  providerId: 'anthropic',
  connectionId: 'anthropic-main',
  connectionLabel: 'Anthropic',
  displayName: 'Claude Opus 4.5',
  contextWindow: 200000,
  maxOutputTokens: 64000,
  inputPrice: 5,
  outputPrice: 25,
  capabilities: { text: true, reasoning: false },
};

describe('ModelInfoSchema', () => {
  it('lists the seven provider type ids including xai and openai-compatible', () => {
    expect([...MODEL_PROVIDER_IDS]).toEqual([
      'anthropic',
      'openai',
      'google',
      'azure',
      'openrouter',
      'xai',
      'openai-compatible',
    ]);
  });

  it('accepts a fully populated model record', () => {
    expect(ModelInfoSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts null price and context fields (openai-compatible / metadata-sparse models)', () => {
    const sparse = {
      ...valid,
      id: 'venice:my-model',
      providerId: 'openai-compatible',
      connectionId: 'venice',
      connectionLabel: 'Venice',
      contextWindow: null,
      maxOutputTokens: null,
      inputPrice: null,
      outputPrice: null,
    };
    expect(ModelInfoSchema.safeParse(sparse).success).toBe(true);
  });

  it('requires connectionId and connectionLabel', () => {
    const { connectionId: _connectionId, ...withoutConnId } = valid;
    expect(ModelInfoSchema.safeParse(withoutConnId).success).toBe(false);
    const { connectionLabel: _connectionLabel, ...withoutConnLabel } = valid;
    expect(ModelInfoSchema.safeParse(withoutConnLabel).success).toBe(false);
  });

  it('rejects an unknown providerId and a negative price', () => {
    expect(ModelInfoSchema.safeParse({ ...valid, providerId: 'nope' }).success).toBe(false);
    expect(ModelInfoSchema.safeParse({ ...valid, inputPrice: -1 }).success).toBe(false);
  });
});

describe('ModelCapabilitiesSchema reasoning flag', () => {
  it('requires both text and reasoning booleans', () => {
    expect(ModelCapabilitiesSchema.parse({ text: true, reasoning: true })).toEqual({
      text: true,
      reasoning: true,
    });
    expect(ModelCapabilitiesSchema.safeParse({ text: true }).success).toBe(false);
  });
});
