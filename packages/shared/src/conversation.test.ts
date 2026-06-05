import { describe, expect, it } from 'vitest';

import { SetModelOverrideSchema, SetReasoningOverrideSchema } from './conversation';

describe('SetReasoningOverrideSchema', () => {
  it('accepts an effort value', () => {
    expect(SetReasoningOverrideSchema.parse({ reasoningOverride: 'low' })).toEqual({
      reasoningOverride: 'low',
    });
  });

  it('accepts null (clear the override back to inherit)', () => {
    expect(SetReasoningOverrideSchema.parse({ reasoningOverride: null })).toEqual({
      reasoningOverride: null,
    });
  });

  it('rejects an unknown key (strict)', () => {
    const result = SetReasoningOverrideSchema.safeParse({
      reasoningOverride: 'low',
      extra: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing reasoningOverride key', () => {
    const result = SetReasoningOverrideSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('SetModelOverrideSchema', () => {
  it('accepts a concrete model id', () => {
    expect(SetModelOverrideSchema.parse({ modelId: 'openai:gpt-4o' })).toEqual({
      modelId: 'openai:gpt-4o',
    });
  });

  it('accepts null (clear the override back to inherit the default)', () => {
    expect(SetModelOverrideSchema.parse({ modelId: null })).toEqual({ modelId: null });
  });

  it('rejects an unknown key (strict)', () => {
    const result = SetModelOverrideSchema.safeParse({ modelId: 'openai:gpt-4o', extra: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a missing modelId key', () => {
    expect(SetModelOverrideSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-string, non-null modelId', () => {
    expect(SetModelOverrideSchema.safeParse({ modelId: 42 }).success).toBe(false);
  });

  it('rejects an empty-string modelId (inherit is null, never "")', () => {
    // The write boundary forbids "" so the stored override is unambiguous: a concrete non-empty id,
    // or null to inherit. A "" would be an unresolvable empty model id, so it is rejected here.
    expect(SetModelOverrideSchema.safeParse({ modelId: '' }).success).toBe(false);
  });
});
