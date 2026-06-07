import { describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from './anvikaMessage';
import { describeMessage } from './messageDescriptor';
import { DEFAULT_TIMESTAMP_OPTIONS } from '../format/timestampOptions';

const now = new Date(2026, 5, 8, 14, 0, 0).getTime();
function msg(role: 'user' | 'assistant', text: string, createdAt?: number): AnvikaUIMessage {
  return {
    id: 'x',
    role,
    parts: [{ type: 'text', text }],
    ...(createdAt ? { metadata: { createdAt } } : {}),
  } as AnvikaUIMessage;
}

const opts = (previewWords = 40, lengthCue: 'count-first' | 'count-after' = 'count-first') => ({
  lengthCue,
  previewWords,
});

const DEFAULT_LABELS = { user: 'You', assistant: 'Assistant' };

describe('describeMessage', () => {
  it('omits the length cue when the message fits the preview (count-first)', () => {
    const at = new Date(2026, 5, 8, 13, 58, 0).getTime(); // 2 minutes before now
    expect(
      describeMessage(
        msg('user', 'Hello there friend', at),
        now,
        opts(),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('You, 2 minutes ago, Hello there friend');
  });

  it('omits the length cue when the message fits the preview (count-after)', () => {
    expect(
      describeMessage(
        msg('assistant', 'short reply'),
        now,
        opts(40, 'count-after'),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('Assistant, short reply');
  });

  it('count-first speaks the TOTAL first, the preview, then the REMAINING, no ellipsis', () => {
    const words = Array.from({ length: 85 }, (_, i) => `w${i + 1}`).join(' ');
    const out = describeMessage(
      msg('assistant', words),
      now,
      opts(40, 'count-first'),
      DEFAULT_LABELS,
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    expect(out.startsWith('Assistant, 85 words. w1 w2')).toBe(true);
    // The preview ends at w40, then a trailing remaining cue closes it (no abrupt stop).
    expect(out).toContain('w40. 45 more words.');
    expect(out.endsWith('45 more words.')).toBe(true);
    expect(out).not.toContain('w41');
    expect(out).not.toContain('…');
  });

  it('count-after speaks the preview then the REMAINING count', () => {
    const words = Array.from({ length: 85 }, (_, i) => `w${i + 1}`).join(' ');
    const out = describeMessage(
      msg('assistant', words),
      now,
      opts(40, 'count-after'),
      DEFAULT_LABELS,
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    expect(out.startsWith('Assistant, w1 w2')).toBe(true);
    expect(out).toContain('w40. 45 more words.');
    expect(out).not.toContain('w41');
  });

  it('respects a custom preview length as the truncation threshold', () => {
    const words = Array.from({ length: 6 }, (_, i) => `w${i + 1}`).join(' ');
    // previewWords 5 => 6 words is truncated; remaining 1 => singular "1 more word"
    expect(
      describeMessage(
        msg('user', words),
        now,
        opts(5, 'count-after'),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('You, w1 w2 w3 w4 w5. 1 more word.');
    // count-first also closes with the remaining cue; remaining 1 => singular "1 more word".
    expect(
      describeMessage(
        msg('user', words),
        now,
        opts(5, 'count-first'),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('You, 6 words. w1 w2 w3 w4 w5. 1 more word.');
  });

  it('treats exactly previewWords words as not truncated (no cue)', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${i + 1}`).join(' ');
    const out = describeMessage(
      msg('assistant', words),
      now,
      opts(40, 'count-first'),
      DEFAULT_LABELS,
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    expect(out).toBe(`Assistant, ${words}`);
  });

  it('drops the dangling comma for an empty message', () => {
    const at = new Date(2026, 5, 8, 13, 58, 0).getTime(); // 2 minutes before now
    expect(
      describeMessage(
        msg('assistant', '', at),
        now,
        opts(),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('Assistant, 2 minutes ago');
    expect(
      describeMessage(msg('assistant', ''), now, opts(), DEFAULT_LABELS, DEFAULT_TIMESTAMP_OPTIONS),
    ).toBe('Assistant');
  });

  it('treats a whitespace-only body like an empty message (no dangling comma)', () => {
    const at = new Date(2026, 5, 8, 13, 58, 0).getTime(); // 2 minutes before now
    // textOf returns the spaces/newlines verbatim; trim().split(/\s+/).filter(Boolean) collapses to
    // [] so it must read identically to an empty message, never "Assistant,  " with a dangling comma.
    expect(
      describeMessage(
        msg('assistant', '   \n  ', at),
        now,
        opts(),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('Assistant, 2 minutes ago');
    expect(
      describeMessage(
        msg('assistant', '   '),
        now,
        opts(),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('Assistant');
  });

  it('appends a thinking-included cue when the message carries reasoning parts', () => {
    const withReasoning = {
      id: 'x',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'pondering' },
        { type: 'text', text: 'short reply' },
      ],
    } as AnvikaUIMessage;
    expect(
      describeMessage(withReasoning, now, opts(), DEFAULT_LABELS, DEFAULT_TIMESTAMP_OPTIONS),
    ).toBe('Assistant, short reply, thinking included');
  });

  it('appends the thinking cue to a truncated (long) reasoning message too', () => {
    const words = Array.from({ length: 85 }, (_, i) => `w${i + 1}`).join(' ');
    const withReasoning = {
      id: 'x',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'pondering' },
        { type: 'text', text: words },
      ],
    } as AnvikaUIMessage;
    const out = describeMessage(
      withReasoning,
      now,
      opts(40, 'count-first'),
      DEFAULT_LABELS,
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    // The thinking cue replaces the terminal period so speech does not stutter on ". ,".
    expect(out.endsWith('45 more words, thinking included')).toBe(true);
    expect(out).not.toContain('words.,');
  });

  it('omits the cue when the message has no reasoning parts', () => {
    expect(
      describeMessage(
        msg('assistant', 'short reply'),
        now,
        opts(),
        DEFAULT_LABELS,
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toBe('Assistant, short reply');
  });

  it('uses the configured role labels in the prefix', () => {
    const words = Array.from({ length: 3 }, (_, i) => `w${i + 1}`).join(' ');
    const out = describeMessage(
      msg('assistant', words),
      now,
      opts(40, 'count-after'),
      {
        user: 'Akash',
        assistant: 'Erica',
      },
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    expect(out.startsWith('Erica, ')).toBe(true);
  });
});
