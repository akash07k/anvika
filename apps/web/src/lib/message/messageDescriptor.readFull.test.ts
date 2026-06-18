import { describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from './anvikaMessage';
import { describeMessage, readFullMessage } from './messageDescriptor';
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

const DEFAULT_LABELS = { user: 'You', assistant: 'Assistant' };

describe('messageDescriptor timestamp options', () => {
  const at = new Date(2026, 5, 8, 13, 53, 42).getTime();
  const labels = { user: 'You', assistant: 'Assistant' };
  const tMsg = (text: string): AnvikaUIMessage =>
    ({
      id: 'm',
      role: 'assistant',
      parts: [{ type: 'text', text }],
      metadata: { createdAt: at },
    }) as never;

  it('uses the not-today absolute fallback per options (24h, no seconds, no weekday, month-first)', () => {
    const refNow = new Date(2026, 5, 11, 9, 0, 0).getTime(); // 3 days later -> absolute fallback
    const out = describeMessage(
      tMsg('hello world'),
      refNow,
      { lengthCue: 'count-after', previewWords: 40 },
      labels,
      { weekday: false, dateStyle: 'month-first', hourCycle: 'h24', seconds: false },
    );
    expect(out).toContain('June 8, 2026 at 13:53');
  });

  it('keeps recent recency relative regardless of options', () => {
    const refNow = at + 90_000;
    const out = describeMessage(
      tMsg('hello'),
      refNow,
      { lengthCue: 'count-after', previewWords: 40 },
      labels,
      { weekday: false, dateStyle: 'month-first', hourCycle: 'h24', seconds: false },
    );
    expect(out).toContain('1 minute ago');
  });

  it('readFullMessage threads options into its relative prefix', () => {
    const refNow = new Date(2026, 5, 11, 9, 0, 0).getTime(); // 3 days later -> absolute fallback
    const customOpts = {
      weekday: false,
      dateStyle: 'month-first' as const,
      hourCycle: 'h24' as const,
      seconds: false,
    };
    const out = readFullMessage(tMsg('body text'), refNow, labels, customOpts);
    expect(out).toContain('June 8, 2026 at 13:53');
    expect(out).toContain('body text');
  });
});

describe('readFullMessage', () => {
  it('prefixes the role and relative time, then the COMPLETE text (untruncated)', () => {
    const at = new Date(2026, 5, 8, 13, 58, 0).getTime(); // 2 minutes before now
    const words = Array.from({ length: 60 }, (_, i) => `w${i + 1}`).join(' ');
    const out = readFullMessage(
      msg('assistant', words, at),
      now,
      DEFAULT_LABELS,
      DEFAULT_TIMESTAMP_OPTIONS,
    );
    expect(out.startsWith('Assistant, 2 minutes ago, w1 w2')).toBe(true);
    expect(out).toContain('w60'); // full text, not truncated at 40 words like the descriptor
  });

  it('keeps the role even when the message has no createdAt (so the listener hears who sent it)', () => {
    expect(
      readFullMessage(msg('user', 'hello world'), now, DEFAULT_LABELS, DEFAULT_TIMESTAMP_OPTIONS),
    ).toBe('You, hello world');
  });

  it('uses the configured role labels in the prefix', () => {
    const at = new Date(2026, 5, 8, 13, 58, 0).getTime();
    expect(
      readFullMessage(
        msg('assistant', 'hello world', at),
        now,
        {
          user: 'Akash',
          assistant: 'Erica',
        },
        DEFAULT_TIMESTAMP_OPTIONS,
      ),
    ).toContain('Erica, ');
  });
});
