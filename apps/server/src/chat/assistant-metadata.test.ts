import { describe, expect, it } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';

import { buildAssistantMetadata } from './assistant-metadata';

/** A minimal `start` part (the builder reads only `type`). */
const startPart = { type: 'start' } as unknown as TextStreamPart<ToolSet>;

/** A minimal content-safe `finish-step` part with the fields the usage mapper reads. */
const finishStepPart = {
  type: 'finish-step',
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
  finishReason: 'stop',
  response: { id: 'resp_1', modelId: 'm', timestamp: new Date(0) },
} as unknown as TextStreamPart<ToolSet>;

describe('buildAssistantMetadata', () => {
  it('stamps createdAt on a start part', () => {
    const meta = buildAssistantMetadata(startPart, {});
    expect(meta?.createdAt).toBeTypeOf('number');
    expect(meta?.usage).toBeUndefined();
    expect(meta?.reasoningMs).toBeUndefined();
  });

  it('returns undefined on finish-step when no model id and no reasoning duration', () => {
    expect(buildAssistantMetadata(finishStepPart, {})).toBeUndefined();
  });

  it('stamps the usage block on finish-step when a resolvedModelId is known', () => {
    const meta = buildAssistantMetadata(finishStepPart, { resolvedModelId: 'openai:m' });
    expect(meta?.usage?.modelId).toBe('openai:m');
    expect(meta?.usage?.tokens).toEqual({ input: 10, output: 20, total: 30 });
    expect(meta?.reasoningMs).toBeUndefined();
  });

  it('stamps reasoningMs on finish-step even with no model id (ephemeral path)', () => {
    const meta = buildAssistantMetadata(finishStepPart, { reasoningMs: 42 });
    expect(meta?.reasoningMs).toBe(42);
    expect(meta?.usage).toBeUndefined();
  });

  it('returns undefined for an unrelated part type', () => {
    const part = { type: 'text-delta' } as unknown as TextStreamPart<ToolSet>;
    expect(buildAssistantMetadata(part, { resolvedModelId: 'openai:m' })).toBeUndefined();
  });
});
