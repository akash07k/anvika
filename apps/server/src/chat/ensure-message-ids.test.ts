import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';

import { ensureMessageIds } from './ensure-message-ids';

/** Deterministic id generator: m1, m2, ... so assertions are stable. */
function stubGen(): () => string {
  let n = 0;
  return () => `m${++n}`;
}

function msg(id: unknown, role: 'user' | 'assistant' = 'assistant'): UIMessage {
  return { id, role, parts: [{ type: 'text', text: 'x' }] } as unknown as UIMessage;
}

describe('ensureMessageIds', () => {
  it('fills empty, whitespace, and missing ids; leaves real ids untouched', () => {
    const input = [msg('real'), msg(''), msg('   '), msg(undefined)];
    const out = ensureMessageIds(input, stubGen());
    expect(out.map((m) => m.id)).toEqual(['real', 'm1', 'm2', 'm3']);
  });

  it('preserves order and all other fields, mutating nothing in place', () => {
    const input = [msg('', 'user')];
    const out = ensureMessageIds(input, stubGen());
    expect(out[0]?.role).toBe('user');
    expect(out[0]?.parts).toEqual([{ type: 'text', text: 'x' }]);
    expect(input[0]?.id).toBe(''); // original untouched (new array on change)
  });

  it('returns the SAME reference when nothing needs filling', () => {
    const input = [msg('a'), msg('b')];
    expect(ensureMessageIds(input, stubGen())).toBe(input);
  });

  it('handles an empty array', () => {
    const input: UIMessage[] = [];
    expect(ensureMessageIds(input, stubGen())).toBe(input);
  });
});
