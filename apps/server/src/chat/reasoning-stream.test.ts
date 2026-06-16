import { simulateReadableStream, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { SettingsSchema } from '@anvika/shared/settings/schema';
import { describe, expect, it } from 'vitest';

import type { ReasoningDecision } from './resolve-reasoning';
import { streamChat } from './stream-chat';

/** A stream that thinks (a reasoning delta) then answers (a text delta), with a gap between. */
function reasoningThenText() {
  return simulateReadableStream({
    initialDelayInMs: 0,
    chunkDelayInMs: 10,
    chunks: [
      { type: 'reasoning-start' as const, id: 'r1' },
      { type: 'reasoning-delta' as const, id: 'r1', delta: 'thinking' },
      { type: 'reasoning-end' as const, id: 'r1' },
      { type: 'text-start' as const, id: 't1' },
      { type: 'text-delta' as const, id: 't1', delta: 'answer' },
      { type: 'text-end' as const, id: 't1' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 2, text: 1, reasoning: 1 },
        },
      },
    ],
  });
}

const oneTurn: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }];

const providerOptionsDecision: ReasoningDecision = {
  enabled: true,
  effort: 'medium',
  enable: {
    kind: 'provider-options',
    providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } } },
  },
};

describe('streamChat reasoning enablement', () => {
  it('spreads provider-options into the streamText call when the decision enables them', async () => {
    let capturedOptions: unknown;
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        capturedOptions = options.providerOptions;
        return { stream: reasoningThenText() };
      },
    });
    const res = await streamChat({ model, messages: oneTurn, reasoning: providerOptionsDecision });
    await res.text();
    expect(capturedOptions).toMatchObject({
      anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } },
    });
  });

  it('translates a unified enable into google thinkingLevel provider options', async () => {
    let capturedOptions: unknown;
    const model = new MockLanguageModelV3({
      doStream: async (options) => {
        capturedOptions = options.providerOptions;
        return { stream: reasoningThenText() };
      },
    });
    const res = await streamChat({
      model,
      messages: oneTurn,
      reasoning: {
        enabled: true,
        effort: 'medium',
        enable: { kind: 'unified', reasoning: 'medium' },
      },
    });
    await res.text();
    expect(capturedOptions).toMatchObject({
      google: { thinkingConfig: { thinkingLevel: 'medium' } },
    });
  });

  it('sends reasoning to the client only when the decision is enabled', async () => {
    const enabled = await streamChat({
      model: new MockLanguageModelV3({ doStream: async () => ({ stream: reasoningThenText() }) }),
      messages: oneTurn,
      reasoning: providerOptionsDecision,
    });
    const enabledBody = await enabled.text();
    // The reasoning part AND its text reach the client (the part type is hyphenated `reasoning-delta`).
    expect(enabledBody).toContain('"type":"reasoning-delta"');
    expect(enabledBody).toContain('thinking');

    const disabled = await streamChat({
      model: new MockLanguageModelV3({ doStream: async () => ({ stream: reasoningThenText() }) }),
      messages: oneTurn,
      reasoning: { enabled: false },
    });
    const disabledBody = await disabled.text();
    // A disabled turn forwards no reasoning part and none of the reasoning TEXT, even though the
    // model emitted it; the answer text still streams.
    expect(disabledBody).not.toContain('"type":"reasoning-delta"');
    expect(disabledBody).not.toContain('thinking');
    expect(disabledBody).toContain('answer');
  });

  it('stamps a non-negative reasoningMs on the assistant message when thinking precedes the answer', async () => {
    const res = await streamChat({
      model: new MockLanguageModelV3({ doStream: async () => ({ stream: reasoningThenText() }) }),
      messages: oneTurn,
      resolvedModelId: 'c:claude-sonnet-4-5',
      settings: SettingsSchema.parse({
        connections: [{ id: 'c', label: 'C', type: 'anthropic', apiKey: 'sk' }],
      }),
      reasoning: providerOptionsDecision,
    });
    const body = await res.text();
    const match = body.match(/"reasoningMs":(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0);
  });
});
