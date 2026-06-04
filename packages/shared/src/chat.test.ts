import { describe, expect, it } from 'vitest';

import { ChatRequestSchema, REQUEST_ID_HEADER } from './chat';

const oneMessage = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }];

describe('ChatRequestSchema', () => {
  it('accepts a non-empty messages array and allows extra transport fields', () => {
    const parsed = ChatRequestSchema.safeParse({
      id: 'c1',
      trigger: 'submit',
      messages: oneMessage,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.messages).toHaveLength(1);
  });

  it('rejects an empty messages array', () => {
    expect(ChatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it('rejects a missing or non-array messages field', () => {
    expect(ChatRequestSchema.safeParse({}).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ messages: 'nope' }).success).toBe(false);
  });

  it('accepts a request with an optional modelId', () => {
    const parsed = ChatRequestSchema.safeParse({
      messages: oneMessage,
      modelId: 'anthropic:claude-opus-4-5',
    });
    expect(parsed.success && parsed.data.modelId).toBe('anthropic:claude-opus-4-5');
  });

  it('accepts a request that omits modelId (ephemeral chat compatibility)', () => {
    const parsed = ChatRequestSchema.safeParse({ messages: oneMessage });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.modelId).toBeUndefined();
  });
});

describe('REQUEST_ID_HEADER', () => {
  it('is the lowercase correlation header name the client and server agree on', () => {
    expect(REQUEST_ID_HEADER).toBe('x-anvika-request-id');
    expect(REQUEST_ID_HEADER).toBe(REQUEST_ID_HEADER.toLowerCase());
  });
});

describe('ChatRequestSchema conversation fields', () => {
  const base = { messages: oneMessage };
  it('accepts an omitted conversationId (ephemeral)', () => {
    expect(ChatRequestSchema.safeParse(base).success).toBe(true);
  });
  it('accepts a short conversationId and integer baseRevision', () => {
    expect(
      ChatRequestSchema.safeParse({
        ...base,
        conversationId: 'aaa-111',
        baseRevision: 3,
      }).success,
    ).toBe(true);
  });
  it('rejects a malformed conversationId', () => {
    expect(ChatRequestSchema.safeParse({ ...base, conversationId: 'nope' }).success).toBe(false);
  });
  it('rejects a negative baseRevision', () => {
    expect(ChatRequestSchema.safeParse({ ...base, baseRevision: -1 }).success).toBe(false);
  });
  it('rejects a non-integer baseRevision', () => {
    expect(ChatRequestSchema.safeParse({ ...base, baseRevision: 1.5 }).success).toBe(false);
  });
  it('still strips unknown transport keys (non-strict)', () => {
    const parsed = ChatRequestSchema.parse({ ...base, id: 'x', trigger: 'submit-message' });
    expect('id' in parsed).toBe(false);
  });
});
