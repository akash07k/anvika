import { describe, expect, it } from 'vitest';

import { DiagnosticBatchSchema } from '@anvika/shared/diagnostics/events';

import { diagnosticLogCalls } from './diag-log-entries';

const batch = DiagnosticBatchSchema.parse({
  entries: [
    {
      seq: 1,
      at: 1_700_000_000_000,
      event: {
        type: 'quickNavResolved',
        key: 'alt+1',
        slot: 1,
        press: 'double',
        found: true,
        total: 4,
        messageId: 'msg_a',
        role: 'assistant',
        index: 3,
      },
    },
    { seq: 2, at: 1_700_000_000_010, event: { type: 'milestone', code: 'notify-error' } },
  ],
});

describe('diagnosticLogCalls', () => {
  it('maps each entry to a category/level/message plus content-safe fields (seq, at, event data)', () => {
    const calls = diagnosticLogCalls(batch, { logContent: false });
    expect(calls).toHaveLength(2);

    const [nav, milestone] = calls;
    expect(nav?.category).toEqual(['keyboard']);
    expect(nav?.level).toBe('info');
    expect(nav?.fields).toMatchObject({ seq: 1, slot: 1, press: 'double', messageId: 'msg_a' });
    expect(nav?.fields).not.toHaveProperty('type');

    expect(milestone?.level).toBe('warning');
    expect(milestone?.category).toEqual([]);
    expect(milestone?.fields).toMatchObject({ seq: 2, code: 'notify-error' });
  });

  it('includes milestone text when content logging is on', () => {
    const calls = diagnosticLogCalls(
      DiagnosticBatchSchema.parse({
        entries: [
          { seq: 1, at: 1, event: { type: 'milestone', code: 'notify-error', text: 'boom' } },
        ],
      }),
      { logContent: true },
    );
    expect(calls[0]?.fields).toMatchObject({ code: 'notify-error', text: 'boom' });
  });

  it('strips milestone text when content logging is off', () => {
    const calls = diagnosticLogCalls(
      DiagnosticBatchSchema.parse({
        entries: [
          { seq: 1, at: 1, event: { type: 'milestone', code: 'notify-error', text: 'boom' } },
        ],
      }),
      { logContent: false },
    );
    expect(calls[0]?.fields).not.toHaveProperty('text');
    expect(calls[0]?.fields).toMatchObject({ code: 'notify-error' });
  });
});
