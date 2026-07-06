import { simulateReadableStream, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import type { ReasoningDecision } from './resolve-reasoning';
import { streamChat } from './stream-chat';

/**
 * A stream whose single text delta carries an inline `<think>...</think>` block followed by the
 * answer - the shape a local (openai-compatible) model emits. `extractReasoningMiddleware` lifts
 * the tagged span into reasoning parts and leaves the visible answer tag-free.
 */
function inlineThinkThenText() {
  return simulateReadableStream({
    initialDelayInMs: 0,
    chunkDelayInMs: 0,
    chunks: [
      { type: 'text-start' as const, id: 't1' },
      { type: 'text-delta' as const, id: 't1', delta: '<think>pondering</think>the answer' },
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

const middlewareDecision: ReasoningDecision = {
  enabled: true,
  effort: 'medium',
  enable: { kind: 'middleware', tagName: 'think' },
};

describe('streamChat middleware reasoning extraction', () => {
  it('extracts inline <think> tags into a reasoning part and strips them from the answer', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({ stream: inlineThinkThenText() }),
    });
    const res = await streamChat({ model, messages: oneTurn, reasoning: middlewareDecision });
    const body = await res.text();
    // The middleware lifts the tagged span into reasoning parts (reasoning-start/-delta/-end).
    expect(body).toContain('"type":"reasoning-delta"');
    expect(body).toContain('pondering');
    // The visible answer survives with the tags stripped out.
    expect(body).toContain('the answer');
    expect(body).not.toContain('<think>');
  });

  it('does not wrap a non-middleware model: a provider-options turn keeps the literal text', async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({ stream: inlineThinkThenText() }),
    });
    const res = await streamChat({
      model,
      messages: oneTurn,
      reasoning: {
        enabled: true,
        effort: 'medium',
        enable: {
          kind: 'provider-options',
          providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 8192 } } },
        },
      },
    });
    const body = await res.text();
    expect(body).toContain('<think>');
  });
});
