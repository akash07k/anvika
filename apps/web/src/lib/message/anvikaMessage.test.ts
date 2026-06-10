import { describe, expect, it } from 'vitest';
import type { AnvikaUIMessage } from './anvikaMessage';
import { messageDomId } from './anvikaMessage';

const m = (id: unknown): AnvikaUIMessage =>
  ({ id, role: 'assistant', parts: [] }) as unknown as AnvikaUIMessage;

describe('messageDomId', () => {
  it('returns a non-blank id unchanged', () => {
    expect(messageDomId(m('abc'), 3)).toBe('abc');
  });
  it('falls back to a positional handle for blank/whitespace/missing ids', () => {
    expect(messageDomId(m(''), 2)).toBe('pos-2');
    expect(messageDomId(m('   '), 5)).toBe('pos-5');
    expect(messageDomId(m(undefined), 0)).toBe('pos-0');
  });
});
