import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { MessageMetadata } from '@anvika/shared/chat/message-metadata';
import { SettingsSchema } from '@anvika/shared/settings/schema';

import type { ChatTurnOutcome } from './conversation-outcome';
import { priceForModelId } from '../models/price';
import { serverLogger } from '../logging/logger';
import { streamChat } from './stream-chat';
import { erroringModel, midStreamErrorModel, okModel, usageMockModel } from './stream-chat.testkit';

/** Pull the text of the trailing assistant message's text parts, joined, for inspection. */
function assistantText(outcome: ChatTurnOutcome | undefined): string {
  const assistant = outcome?.finalMessages.findLast((m) => m.role === 'assistant');
  if (!assistant) return '';
  return assistant.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

const userMessages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
] as UIMessage[];

describe('streamChat turn outcomes and usage metadata', () => {
  it('invokes onTurnFinish with a completed outcome including the assistant message', async () => {
    const outcomes: ChatTurnOutcome[] = [];
    const res = await streamChat({
      model: okModel(),
      messages: userMessages,
      onTurnFinish: (o) => {
        outcomes.push(o);
      },
    });
    await res.text(); // drain the stream so onFinish fires
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.status).toBe('completed');
    const roles = outcomes[0]?.finalMessages.map((m) => m.role);
    expect(roles).toContain('assistant');
    expect(outcomes[0]?.incomingMessages.map((m) => m.role)).toEqual(['user']);
  });

  it('stamps the assistant message with a numeric metadata.createdAt', async () => {
    // Asserted through the real stream + persistence path: the SDK assembles the assistant message
    // (with the messageMetadata-supplied createdAt) and hands it to onFinish, which maps it into the
    // outcome's finalMessages. This exercises the same path that persists the conversation.
    const outcomes: ChatTurnOutcome[] = [];
    const before = Date.now();
    const res = await streamChat({
      model: okModel(),
      messages: userMessages,
      onTurnFinish: (o) => {
        outcomes.push(o);
      },
    });
    await res.text(); // drain the stream so onFinish fires
    const after = Date.now();
    const assistant = outcomes[0]?.finalMessages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    const createdAt = (assistant?.metadata as { createdAt?: unknown } | undefined)?.createdAt;
    expect(typeof createdAt).toBe('number');
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it('invokes onTurnFinish with an error outcome when the stream errors', async () => {
    const outcomes: ChatTurnOutcome[] = [];
    const res = await streamChat({
      model: erroringModel(),
      messages: userMessages,
      onTurnFinish: (o) => {
        outcomes.push(o);
      },
    });
    await res.text(); // drain the stream so onFinish fires
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.status).toBe('error');
    expect(outcomes[0]?.incomingMessages.map((m) => m.role)).toEqual(['user']);
  });

  it('maps a mid-stream error to an error outcome and pins the SDK-preserved partial text', async () => {
    // Drive the real streamChat path with a model that streams "partial" then errors mid-stream,
    // to pin what ai@6.0.197 assembles into onFinish's messages. The assertion below reflects the
    // ACTUAL observed SDK behavior (run-driven), not a hoped-for shape - see the inline finding.
    let outcome: ChatTurnOutcome | undefined;
    const res = await streamChat({
      model: midStreamErrorModel(),
      messages: userMessages,
      resolvedModelId: 'work:claude',
      onTurnFinish: (o) => {
        outcome = o;
      },
    });
    await res.text(); // drain the stream so onFinish fires
    expect(outcome?.status).toBe('error');
    // FINDING: ai@6.0.197 DOES preserve the partial assistant text streamed before a
    // mid-stream `error` part - the SDK assembles the trailing assistant message from the deltas it
    // saw, so the error branch (persist the marked partial turn) is reachable on a real error path.
    expect(assistantText(outcome)).toContain('partial');
  });

  it('assigns a non-empty assistant message id via generateMessageId', async () => {
    let captured: ChatTurnOutcome | undefined;
    const response = await streamChat({
      model: okModel(),
      messages: userMessages,
      onTurnFinish: (o) => void (captured = o),
    });
    await response.text(); // drain so onFinish runs
    const assistant = captured?.finalMessages.find((m) => m.role === 'assistant');
    expect(assistant?.id).toBeTruthy();
    expect(assistant?.id).not.toBe('');
  });

  it('contains and logs an onTurnFinish persistence failure without throwing to the caller', async () => {
    // The onTurnFinish callback fires after the response has streamed, so a rejection there cannot
    // reach the client; streamChat must catch it and log the operational error only (no content).
    // `serverLogger` returns the same cached LogTape instance per category, so spying is stable.
    const errorSpy = vi.spyOn(serverLogger('chat'), 'error');
    try {
      const res = await streamChat({
        model: okModel(),
        messages: userMessages,
        onTurnFinish: () => Promise.reject(new Error('db down')),
      });
      // Draining must resolve - the catch in streamChat prevents the rejection from surfacing here.
      await expect(res.text()).resolves.toBeTypeOf('string');

      // LogTape's error() is overloaded; treat recorded calls as (message, properties) tuples.
      const calls = errorSpy.mock.calls as unknown as [string, { message?: string }?][];
      const persistenceCall = calls.find(([msg]) => msg === 'failed to persist conversation turn');
      expect(persistenceCall).toBeDefined();
      const payload = persistenceCall?.[1];
      expect(payload?.message).toContain('db down');
      // Privacy: the logged payload carries only the error string - no message/prompt text.
      expect(JSON.stringify(payload)).not.toContain('Hi');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('stamps content-safe usage metadata on the assistant turn', async () => {
    const settings = SettingsSchema.parse({
      connections: [{ id: 'anthropic', label: 'Anthropic', type: 'anthropic', apiKey: 'sk' }],
      selectedModelId: 'anthropic:claude-haiku-4-5',
    });
    let outcome: ChatTurnOutcome | undefined;
    const res = await streamChat({
      model: usageMockModel({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }] as UIMessage[],
      resolvedModelId: 'anthropic:claude-haiku-4-5',
      settings,
      onTurnFinish: (o) => {
        outcome = o;
      },
    });
    await res.text(); // drain so onFinish/onTurnFinish run
    const assistant = outcome?.finalMessages?.at(-1);
    const meta = assistant?.metadata as MessageMetadata | undefined;
    const usage = meta?.usage;
    expect(usage?.tokens).toEqual({ input: 100, output: 50, total: 150 });
    expect(usage?.finishReason).toBe('stop');
    expect(usage?.modelId).toBe('anthropic:claude-haiku-4-5');
    // Assert the stamped snapshot equals the catalog lookup for this model id, not hard-coded
    // rates - the catalog price can change legitimately without the stamping logic being wrong.
    const expectedPrice = priceForModelId('anthropic:claude-haiku-4-5', settings);
    expect(expectedPrice).not.toBeNull();
    expect(usage?.price).toEqual(expectedPrice);
    expect(meta?.createdAt).toBeTypeOf('number'); // createdAt still present (merge)
  });
});
