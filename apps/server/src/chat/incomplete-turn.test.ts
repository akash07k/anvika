import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { assistantTurnHasContent, markIncompleteTurn } from './incomplete-turn';

/** A minimal assistant UIMessage with the given parts and metadata. */
function assistant(parts: UIMessage['parts'], metadata?: unknown): UIMessage {
  return { id: 'a1', role: 'assistant', parts, ...(metadata ? { metadata } : {}) } as UIMessage;
}
const user: UIMessage = {
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
} as UIMessage;

describe('assistantTurnHasContent', () => {
  it('is true when the last assistant message has non-empty text', () => {
    expect(assistantTurnHasContent([user, assistant([{ type: 'text', text: 'partial' }])])).toBe(
      true,
    );
  });

  it('is true when the last assistant message has token usage but no text', () => {
    expect(
      assistantTurnHasContent([
        user,
        assistant([], { createdAt: 1, usage: { tokens: { output: 5 } } }),
      ]),
    ).toBe(true);
  });

  it('is false for an empty assistant message (no text, no tokens)', () => {
    expect(assistantTurnHasContent([user, assistant([], { createdAt: 1 })])).toBe(false);
    expect(assistantTurnHasContent([user, assistant([{ type: 'text', text: '   ' }])])).toBe(false);
  });

  it('is false when the last message is not an assistant message', () => {
    expect(assistantTurnHasContent([user])).toBe(false);
    expect(assistantTurnHasContent([])).toBe(false);
  });
});

describe('markIncompleteTurn', () => {
  it('stamps the marker on the last assistant message, preserving existing usage and createdAt', () => {
    const input = [
      user,
      assistant([{ type: 'text', text: 'partial' }], {
        createdAt: 42,
        usage: { modelId: 'work:claude', tokens: { output: 5 } },
      }),
    ];
    const out = markIncompleteTurn(input, 'aborted');
    const meta = out[1]?.metadata as { createdAt: number; usage: Record<string, unknown> };
    expect(meta.usage.incompleteReason).toBe('aborted');
    expect(meta.usage.modelId).toBe('work:claude');
    expect((meta.usage.tokens as { output: number }).output).toBe(5);
    expect(meta.createdAt).toBe(42);
    expect(out[0]).toBe(input[0]); // other messages untouched (same reference)
  });

  it('creates a minimal usage block when the message has none', () => {
    const out = markIncompleteTurn([user, assistant([], { createdAt: 7 })], 'error');
    const meta = out[1]?.metadata as { usage: { incompleteReason: string } };
    expect(meta.usage.incompleteReason).toBe('error');
  });

  it('stamps the resolved model id when the message has none', () => {
    const out = markIncompleteTurn(
      [user, assistant([], { createdAt: 7 })],
      'aborted',
      'work:claude',
    );
    const meta = out[1]?.metadata as { usage: { modelId: string } };
    expect(meta.usage.modelId).toBe('work:claude');
  });

  it('does NOT overwrite a captured model id with the resolved id', () => {
    const out = markIncompleteTurn(
      [user, assistant([], { createdAt: 7, usage: { modelId: 'real:id' } })],
      'aborted',
      'work:claude',
    );
    const meta = out[1]?.metadata as { usage: { modelId: string } };
    expect(meta.usage.modelId).toBe('real:id');
  });

  it('returns the input unchanged when the last message is not an assistant message', () => {
    const input = [user];
    expect(markIncompleteTurn(input, 'error')).toBe(input);
  });
});
