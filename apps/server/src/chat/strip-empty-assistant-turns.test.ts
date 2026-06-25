import { describe, expect, it } from 'vitest';

import { stripEmptyAssistantTurns } from './strip-empty-assistant-turns';

const user = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] };
const userNew = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'again' }] };
const emptyAssistant = { id: 'a1', role: 'assistant', parts: [] };
const goodAssistant = { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] };

describe('stripEmptyAssistantTurns', () => {
  it('drops an assistant turn with empty parts (the errored-turn case)', () => {
    expect(stripEmptyAssistantTurns([user, emptyAssistant, userNew])).toEqual([user, userNew]);
  });

  it('keeps assistant turns that carry at least one part', () => {
    expect(stripEmptyAssistantTurns([user, goodAssistant])).toEqual([user, goodAssistant]);
  });

  it('keeps a user message even if its parts are empty (only assistant turns are stripped)', () => {
    const emptyUser = { id: 'u3', role: 'user', parts: [] };
    expect(stripEmptyAssistantTurns([emptyUser])).toEqual([emptyUser]);
  });

  it('leaves non-record entries untouched (defensive over unknown input)', () => {
    expect(stripEmptyAssistantTurns(['x', 5, null, user])).toEqual(['x', 5, null, user]);
  });

  it('treats an assistant message with no parts field as content-bearing (not the empty-array case)', () => {
    const noParts = { id: 'a3', role: 'assistant' };
    expect(stripEmptyAssistantTurns([user, noParts])).toEqual([user, noParts]);
  });
});
