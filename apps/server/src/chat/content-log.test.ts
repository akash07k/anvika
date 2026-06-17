import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { latestUserText, messageText } from './content-log';

const userMessage: UIMessage = {
  id: 'u1',
  role: 'user',
  parts: [
    { type: 'text', text: 'Hello ' },
    { type: 'text', text: 'world' },
  ],
};

const assistantMessage: UIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Hi' }],
};

describe('messageText', () => {
  it('concatenates the text parts of a message', () => {
    expect(messageText(userMessage)).toBe('Hello world');
  });
});

describe('latestUserText', () => {
  it('returns the text of the last user message', () => {
    expect(latestUserText([userMessage, assistantMessage])).toBe('Hello world');
  });

  it('returns an empty string when there is no user message', () => {
    expect(latestUserText([assistantMessage])).toBe('');
  });
});
