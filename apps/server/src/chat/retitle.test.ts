import { MockLanguageModelV3 } from 'ai/test';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { ChatProviderUnconfiguredError } from '../models/registry';
import type { ResolvedChatModel } from './resolve-model';
import { retitleConversation } from './retitle';

/** The captured `prompt` the mock model saw (the AI SDK's provider message array, kept untyped here). */
type CapturedPrompt = { prompt?: unknown };

/** Build a `ResolvedChatModel` around a mock that returns `output` and captures the prompt it saw. */
function mockResolver(output: string, captured: CapturedPrompt) {
  const model = new MockLanguageModelV3({
    doGenerate: (options) => {
      captured.prompt = options.prompt;
      return Promise.resolve({
        content: [{ type: 'text' as const, text: output }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      });
    },
  });
  return (): Promise<ResolvedChatModel> =>
    Promise.resolve({
      model,
      resolvedModelId: 'c:mock',
      // The retitle path never reads settings; an empty object satisfies the type at the seam.
      settings: {} as ResolvedChatModel['settings'],
    });
}

/** A user message with the given text. */
function user(id: string, text: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] } as UIMessage;
}

/** An assistant message with the given text. */
function assistant(id: string, text: string): UIMessage {
  return { id, role: 'assistant', parts: [{ type: 'text', text }] } as UIMessage;
}

/** A provider message with text parts (the subset of the prompt shape these assertions read). */
interface ProviderMessage {
  content: string | { type: string; text?: string }[];
}

/** Flatten every text part of the captured prompt into one string, for leak assertions. */
function promptText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return '';
  return (prompt as ProviderMessage[])
    .flatMap((m) =>
      Array.isArray(m.content)
        ? m.content.map((p) => (p.type === 'text' ? (p.text ?? '') : ''))
        : [m.content],
    )
    .join('\n');
}

describe('retitleConversation', () => {
  it('samples first user + most-recent user + latest assistant, and no other turns leak in', async () => {
    const captured: CapturedPrompt = {};
    const messages: UIMessage[] = [
      user('u1', 'FIRST_USER'),
      assistant('a1', 'MIDDLE_ASSISTANT'),
      user('u2', 'MIDDLE_USER'),
      assistant('a2', 'LATEST_ASSISTANT'),
      user('u3', 'RECENT_USER'),
    ];
    const title = await retitleConversation({
      resolveModel: mockResolver('A title', captured),
      messages,
    });
    const text = promptText(captured.prompt);
    expect(text).toContain('FIRST_USER');
    expect(text).toContain('RECENT_USER');
    expect(text).toContain('LATEST_ASSISTANT');
    // No other turn must leak into the sample.
    expect(text).not.toContain('MIDDLE_ASSISTANT');
    expect(text).not.toContain('MIDDLE_USER');
    expect(title).toBe('A title');
  });

  it('includes a single user turn once when first user == most-recent user', async () => {
    const captured: CapturedPrompt = {};
    const messages: UIMessage[] = [user('u1', 'ONLY_USER')];
    await retitleConversation({ resolveModel: mockResolver('Solo', captured), messages });
    const text = promptText(captured.prompt);
    const occurrences = text.split('ONLY_USER').length - 1;
    expect(occurrences).toBe(1);
  });

  it('returns the trimmed, quote-stripped title from the model output', async () => {
    const captured: CapturedPrompt = {};
    const messages: UIMessage[] = [user('u1', 'Hi')];
    const title = await retitleConversation({
      resolveModel: mockResolver('  "Quoted Title"  ', captured),
      messages,
    });
    expect(title).toBe('Quoted Title');
  });

  it('caps an over-long model output at the word boundary (<= 60 chars)', async () => {
    const captured: CapturedPrompt = {};
    const messages: UIMessage[] = [user('u1', 'Hi')];
    const longOutput =
      'This title is intentionally far longer than sixty characters so the cap engages';
    const title = await retitleConversation({
      resolveModel: mockResolver(longOutput, captured),
      messages,
    });
    expect(title.length).toBeLessThanOrEqual(60);
    // Capped at a word boundary: no trailing partial word / space.
    expect(title).toBe(title.trimEnd());
    expect(longOutput.startsWith(title)).toBe(true);
  });

  it('falls back to the placeholder title when the model returns blank text on an empty draft', async () => {
    // The reasoning create-if-absent path can leave an empty-messages row; a blank model response
    // would cap to '' and make RetitleResultSchema reject the body. The derived title for no user
    // text is NEW_CONVERSATION_TITLE, so the response stays valid.
    const captured: CapturedPrompt = {};
    const title = await retitleConversation({
      resolveModel: mockResolver('   ', captured),
      messages: [],
    });
    expect(title).toBe('New conversation');
  });

  it('falls back to the messages-derived title when the model returns blank text', async () => {
    const captured: CapturedPrompt = {};
    const messages: UIMessage[] = [user('u1', 'How do I brew espresso?')];
    const title = await retitleConversation({
      resolveModel: mockResolver('', captured),
      messages,
    });
    expect(title).toBe('How do I brew espresso?');
  });

  it('surfaces the unconfigured error when the model cannot be resolved', async () => {
    const messages: UIMessage[] = [user('u1', 'Hi')];
    await expect(
      retitleConversation({
        resolveModel: () => {
          throw new ChatProviderUnconfiguredError('Add a key in Settings.');
        },
        messages,
      }),
    ).rejects.toBeInstanceOf(ChatProviderUnconfiguredError);
  });
});
