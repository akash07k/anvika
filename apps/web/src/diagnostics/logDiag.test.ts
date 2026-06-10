import { describe, expect, it } from 'vitest';

import type { DiagnosticEntry } from '@anvika/shared/diagnostics/events';

import { createDiagnostics } from './logDiag';
import type { Batcher } from './batcher';

function fakeBatcher(): { batcher: Batcher; seen: DiagnosticEntry[] } {
  const seen: DiagnosticEntry[] = [];
  return {
    seen,
    batcher: {
      enqueue: (e) => seen.push(e),
      flush: async () => {},
      size: () => seen.length,
      isDisabled: () => false,
    },
  };
}

describe('createDiagnostics', () => {
  it('stamps a monotonic seq and the client time, wrapping the event', () => {
    const { batcher, seen } = fakeBatcher();
    let clock = 1000;
    const { logDiag } = createDiagnostics({ batcher, now: () => clock });
    logDiag({ type: 'milestone', code: 'app-mounted' });
    clock = 1005;
    logDiag({ type: 'focusOutcome', domId: 'message-x', outcome: 'focused' });
    expect(seen[0]).toMatchObject({ seq: 0, at: 1000, event: { type: 'milestone' } });
    expect(seen[1]).toMatchObject({ seq: 1, at: 1005, event: { type: 'focusOutcome' } });
  });

  it('clientLog enqueues a milestone entry for the code', () => {
    const { batcher, seen } = fakeBatcher();
    const { clientLog } = createDiagnostics({ batcher, now: () => 1 });
    clientLog('notify-error');
    expect(seen[0]?.event).toEqual({ type: 'milestone', code: 'notify-error' });
  });

  it('clientLog attaches allow-listed text when given, and omits the key when not', () => {
    const { batcher, seen } = fakeBatcher();
    const { clientLog } = createDiagnostics({ batcher, now: () => 1 });
    clientLog('notify-error', 'boom');
    clientLog('app-mounted');
    expect(seen[0]?.event).toEqual({ type: 'milestone', code: 'notify-error', text: 'boom' });
    // With no text the `text` key is ABSENT (not `undefined`), so the conditional spread satisfies
    // exactOptionalPropertyTypes and the schema's allow-list refine.
    expect(seen[1]?.event).not.toHaveProperty('text');
  });

  it('draws seq from an injected shared counter when provided', () => {
    const { batcher, seen } = fakeBatcher();
    let n = 50;
    const { logDiag } = createDiagnostics({ batcher, now: () => 1, nextSeq: () => n++ });
    logDiag({ type: 'milestone', code: 'app-mounted' });
    logDiag({ type: 'milestone', code: 'app-mounted' });
    expect(seen[0]?.seq).toBe(50);
    expect(seen[1]?.seq).toBe(51);
  });

  it('delegates isDisabled to the underlying batcher', () => {
    const seen: DiagnosticEntry[] = [];
    let disabled = false;
    const { isDisabled } = createDiagnostics({
      batcher: {
        enqueue: (e) => seen.push(e),
        flush: async () => {},
        size: () => seen.length,
        isDisabled: () => disabled,
      },
      now: () => 1,
    });
    expect(isDisabled()).toBe(false);
    disabled = true;
    expect(isDisabled()).toBe(true);
  });
});
