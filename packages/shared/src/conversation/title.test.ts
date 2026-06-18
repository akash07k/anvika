import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { deriveConversationTitle } from './title';

const user = (text: string): UIMessage =>
  ({ id: 'u', role: 'user', parts: [{ type: 'text', text }] }) as UIMessage;
const assistant = (text: string): UIMessage =>
  ({ id: 'a', role: 'assistant', parts: [{ type: 'text', text }] }) as UIMessage;

describe('deriveConversationTitle', () => {
  it('returns the New conversation fallback for an empty list', () => {
    expect(deriveConversationTitle([])).toBe('New conversation');
  });
  it('returns the fallback when there is no user text', () => {
    expect(deriveConversationTitle([assistant('hi')])).toBe('New conversation');
  });
  it('uses the first user message, collapsing whitespace', () => {
    expect(deriveConversationTitle([user('  Plan  my\n trip ')])).toBe('Plan my trip');
  });
  it('caps at ~60 chars on a word boundary without a trailing space', () => {
    const long = 'word '.repeat(40).trim();
    const title = deriveConversationTitle([user(long)]);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(' ')).toBe(false);
    expect(long.startsWith(title)).toBe(true);
  });

  // additional edge-case tests

  it('hard-cuts a single word longer than 60 chars at exactly 60 chars', () => {
    const long = 'x'.repeat(80);
    const title = deriveConversationTitle([user(long)]);
    expect(title.length).toBe(60);
    expect(title.endsWith(' ')).toBe(false);
  });
  it('returns the fallback when user message has no text parts', () => {
    const noText = {
      id: 'u',
      role: 'user',
      parts: [{ type: 'step-start' }],
    } as unknown as UIMessage;
    expect(deriveConversationTitle([noText])).toBe('New conversation');
  });
  it('joins multiple text parts with a single space, collapsing whitespace', () => {
    const multiPart = {
      id: 'u',
      role: 'user',
      parts: [
        { type: 'text', text: 'Plan my' },
        { type: 'text', text: 'trip' },
      ],
    } as unknown as UIMessage;
    expect(deriveConversationTitle([multiPart])).toBe('Plan my trip');
  });
});
