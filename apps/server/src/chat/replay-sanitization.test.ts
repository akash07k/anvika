import { convertToModelMessages, type ModelMessage, type UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  pruneReasoningForReplay,
  stripIncompleteTurns,
  stripItemReferences,
} from './replay-sanitization';

const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as UIMessage;
const completed = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'done' }],
  metadata: { createdAt: 1, usage: { tokens: { output: 2 } } },
} as UIMessage;
const incomplete = {
  id: 'a2',
  role: 'assistant',
  parts: [{ type: 'text', text: 'partial' }],
  metadata: { createdAt: 2, usage: { incompleteReason: 'aborted' } },
} as UIMessage;

describe('stripIncompleteTurns', () => {
  it('drops assistant turns marked incompleteReason, keeping user and completed turns', () => {
    const out = stripIncompleteTurns([user, completed, user, incomplete]);
    expect(out).toEqual([user, completed, user]);
  });

  it('returns the same reference when nothing is incomplete', () => {
    const input = [user, completed];
    expect(stripIncompleteTurns(input)).toBe(input);
  });
});

describe('stripItemReferences', () => {
  it('removes itemId from a text part while keeping the text', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'hello', providerMetadata: { openai: { itemId: 'msg_222' } } },
        ],
      },
    ];
    const json = JSON.stringify(stripItemReferences(messages));
    expect(json).not.toContain('msg_222');
    expect(json).toContain('hello');
  });

  it('removes itemId from a reasoning part too', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'why', providerMetadata: { openai: { itemId: 'rs_111' } } },
        ],
      },
    ];
    expect(JSON.stringify(stripItemReferences(messages))).not.toContain('rs_111');
  });

  it('keeps other provider options and drops a namespace left empty', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'x',
            providerMetadata: {
              openai: { itemId: 'msg_1' },
              anthropic: { cacheControl: 'ephemeral' },
            },
          },
        ],
      },
    ];
    const result = stripItemReferences(messages);
    const part = result[0]?.parts[0] as { providerMetadata?: Record<string, unknown> };
    expect(part.providerMetadata).toEqual({ anthropic: { cacheControl: 'ephemeral' } });
  });

  it('strips itemId from every namespace that carries one', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'x',
            providerMetadata: {
              openai: { itemId: 'msg_1' },
              azure: { itemId: 'ai_2', foo: 'bar' },
            },
          },
        ],
      },
    ];
    const result = stripItemReferences(messages);
    const part = result[0]?.parts[0] as { providerMetadata?: Record<string, unknown> };
    expect(part.providerMetadata).toEqual({ azure: { foo: 'bar' } });
  });

  it('is a no-op (same part reference) when no part carries an itemId', () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hello', providerMetadata: { openai: { foo: 'bar' } } }],
      },
    ];
    const result = stripItemReferences(messages);
    expect(result[1]?.parts[0]).toBe(messages[1]?.parts[0]);
  });

  it('does not mutate the input', () => {
    const messages: UIMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'x', providerMetadata: { openai: { itemId: 'msg_9' } } }],
      },
    ];
    const snapshot = JSON.stringify(messages);
    stripItemReferences(messages);
    expect(JSON.stringify(messages)).toBe(snapshot);
  });
});

/** Count assistant reasoning parts in ModelMessages (test-side mirror of the helper's invariant). */
function reasoningCount(messages: ModelMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'reasoning') count += 1;
    }
  }
  return count;
}

describe('pruneReasoningForReplay', () => {
  it('removes reasoning parts and reports how many were pruned', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'thinking' },
          { type: 'text', text: 'hello' },
        ],
      },
    ];
    const result = await pruneReasoningForReplay(messages);
    expect(result.prunedReasoning).toBe(1);
    expect(reasoningCount(result.messages)).toBe(0);
  });

  it('counts every reasoning part across multiple assistant turns', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q1' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'r1a' },
          { type: 'reasoning', text: 'r1b' },
          { type: 'text', text: 'a1' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'q2' }] },
      {
        id: 'a2',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'r2' },
          { type: 'text', text: 'a2' },
        ],
      },
    ];
    const result = await pruneReasoningForReplay(messages);
    expect(result.prunedReasoning).toBe(3);
    expect(reasoningCount(result.messages)).toBe(0);
  });

  it('preserves text content and message order', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'q' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'r' },
          { type: 'text', text: 'answer' },
        ],
      },
    ];
    const result = await pruneReasoningForReplay(messages);
    expect(result.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(result.messages[1]?.content)).toContain('answer');
    expect(reasoningCount(result.messages)).toBe(0);
  });

  it('drops an assistant message that held only reasoning', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'reasoning', text: 'only thinking' }] },
    ];
    const result = await pruneReasoningForReplay(messages);
    expect(result.prunedReasoning).toBe(1);
    expect(result.messages.map((m) => m.role)).toEqual(['user']);
  });

  it('is a pass-through when there is no reasoning (count 0)', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ];
    const result = await pruneReasoningForReplay(messages);
    expect(result.prunedReasoning).toBe(0);
    expect(result.messages).toEqual(await convertToModelMessages(messages));
  });

  it('does not mutate the input messages', async () => {
    const messages: UIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 't' },
          { type: 'text', text: 'a' },
        ],
      },
    ];
    const snapshot = JSON.stringify(messages);
    await pruneReasoningForReplay(messages);
    expect(JSON.stringify(messages)).toBe(snapshot);
  });
});
