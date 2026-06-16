import { simulateReadableStream, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import type { ChatTurnOutcome } from './conversation-outcome';
import { captureServerLogs } from '../logging/log-capture';
import { streamChat } from './stream-chat';

/** A finished one-token text stream (the AI SDK chunk shape used across these tests). */
function textStream(delta: string) {
  return simulateReadableStream({
    chunks: [
      { type: 'text-start' as const, id: 't1' },
      { type: 'text-delta' as const, id: 't1', delta },
      { type: 'text-end' as const, id: 't1' },
      {
        type: 'finish' as const,
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
      },
    ],
  });
}

/** A mock that streams a fixed token. */
function okModel() {
  return new MockLanguageModelV3({ doStream: async () => ({ stream: textStream('ok') }) });
}

/** A mock that hands the model-facing prompt to `onPrompt`, then streams a fixed token. */
function capturingModel(onPrompt: (prompt: unknown) => void) {
  return new MockLanguageModelV3({
    doStream: async (options) => {
      onPrompt(options.prompt);
      return { stream: textStream('ok') };
    },
  });
}

/** A mock that throws on stream start (drives the error outcome). */
function erroringModel() {
  return new MockLanguageModelV3({
    doStream: async () => {
      throw new Error('boom');
    },
  });
}

/** A single user turn with no reasoning - the common case. */
const noReasoning: UIMessage[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
];

describe('streamChat reasoning replay', () => {
  it('prunes reasoning from the model prompt while persistence keeps it', async () => {
    let capturedPrompt: unknown;
    const history: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'secret thoughts' },
          { type: 'text', text: 'Earlier answer' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    let captured: ChatTurnOutcome | undefined;
    const res = await streamChat({
      model: capturingModel((p) => (capturedPrompt = p)),
      messages: history,
      onTurnFinish: (o) => void (captured = o),
    });
    await res.text();
    // This also guards the cross-provider case: the prune is provider-independent, so a prior
    // provider's reasoning never reaches the next model, whatever model that is.
    // Structural check: no assistant message the model received carries a reasoning part.
    const promptMessages = JSON.parse(JSON.stringify(capturedPrompt)) as Array<{
      role: string;
      content?: string | Array<{ type: string }>;
    }>;
    const reasoningInPrompt = promptMessages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'reasoning'),
    );
    expect(reasoningInPrompt).toBe(false);
    // Content-leak guard: the reasoning text never reached the model; assistant text survives.
    expect(JSON.stringify(capturedPrompt)).not.toContain('secret thoughts');
    expect(JSON.stringify(capturedPrompt)).toContain('Earlier answer');
    expect(JSON.stringify(capturedPrompt)).toContain('Continue');
    // A completed turn persists finalMessages - assert the reasoning survives THERE.
    expect(JSON.stringify(captured?.finalMessages)).toContain('secret thoughts');
  });

  it('strips server-side item references so no dangling itemId reaches the model', async () => {
    let capturedPrompt: unknown;
    const history: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Earlier answer',
            providerMetadata: { openai: { itemId: 'msg_777' } },
          },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    const res = await streamChat({
      model: capturingModel((p) => (capturedPrompt = p)),
      messages: history,
    });
    await res.text();
    const sent = JSON.stringify(capturedPrompt);
    // The OpenAI item id is gone, so the provider cannot emit a dangling item_reference on replay.
    expect(sent).not.toContain('msg_777');
    // The inline text content is preserved as the authoritative input.
    expect(sent).toContain('Earlier answer');
  });

  it('keeps reasoning in the incoming messages on an error outcome', async () => {
    const history: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'secret thoughts' },
          { type: 'text', text: 'Earlier' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Continue' }] },
    ];
    let captured: ChatTurnOutcome | undefined;
    const res = await streamChat({
      model: erroringModel(),
      messages: history,
      onTurnFinish: (o) => void (captured = o),
    });
    await res.text();
    expect(captured?.status).toBe('error');
    // The error policy persists incomingMessages; the reasoning history survives for a retry.
    expect(JSON.stringify(captured?.incomingMessages)).toContain('secret thoughts');
  });

  it('emits a content-safe debug line counting the reasoning parts it pruned', async () => {
    const capture = await captureServerLogs({ level: 'debug' });
    try {
      const history: UIMessage[] = [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
        {
          id: 'a1',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'private reasoning' },
            { type: 'reasoning', text: 'more private reasoning' },
            { type: 'text', text: 'A' },
          ],
        },
        { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'More' }] },
      ];
      const res = await streamChat({ model: okModel(), messages: history });
      await res.text();
      const record = capture.records.find((r) =>
        String(r.message).includes('pruned reasoning parts for replay'),
      );
      expect(record?.level).toBe('debug');
      expect(record?.properties).toMatchObject({ count: 2 });
      expect(JSON.stringify(record)).not.toContain('private reasoning');
    } finally {
      await capture.teardown();
    }
  });

  it('emits no prune debug line when there is no reasoning to prune', async () => {
    const capture = await captureServerLogs({ level: 'debug' });
    try {
      const res = await streamChat({ model: okModel(), messages: noReasoning });
      await res.text();
      const record = capture.records.find((r) =>
        String(r.message).includes('pruned reasoning parts for replay'),
      );
      expect(record).toBeUndefined();
    } finally {
      await capture.teardown();
    }
  });
});
