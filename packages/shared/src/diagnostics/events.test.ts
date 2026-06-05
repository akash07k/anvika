import { describe, expect, it } from 'vitest';

import { MAX_MILESTONE_TEXT } from '../client-log';
import { DiagnosticBatchSchema, DiagnosticEventSchema } from './events';

const envelope = { seq: 1, at: 1_700_000_000_000 };

describe('DiagnosticEventSchema', () => {
  it('accepts a quickNavResolved event with optional target omitted', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'quickNavResolved',
      key: 'alt+5',
      slot: 5,
      press: 'double',
      found: false,
      total: 3,
    });
    expect(parsed.type).toBe('quickNavResolved');
  });

  it('accepts a quickNavResolved event with alreadyFocused:true (double-press re-target)', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'quickNavResolved',
      key: 'alt+1',
      slot: 1,
      press: 'double',
      found: true,
      total: 2,
      messageId: 'a1',
      role: 'assistant',
      index: 1,
      alreadyFocused: true,
    });
    expect(parsed.type).toBe('quickNavResolved');
    expect((parsed as { alreadyFocused?: boolean }).alreadyFocused).toBe(true);
  });

  it('accepts a focusOutcome event', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'focusOutcome',
      domId: 'message-pos-1',
      outcome: 'skipped-empty-id',
    });
    expect(parsed.type).toBe('focusOutcome');
  });

  it('accepts a milestone event carrying an allow-listed code', () => {
    const parsed = DiagnosticEventSchema.parse({ type: 'milestone', code: 'app-mounted' });
    expect(parsed.type).toBe('milestone');
  });

  it('rejects an unknown event type', () => {
    expect(() => DiagnosticEventSchema.parse({ type: 'totally-made-up' })).toThrow();
  });

  it('rejects an extra free-form field on a variant (structural content-safety)', () => {
    expect(() =>
      DiagnosticEventSchema.parse({
        type: 'focusOutcome',
        domId: 'message-x',
        outcome: 'focused',
        prompt: 'leaked text',
      }),
    ).toThrow();
  });

  it('accepts a sendKeyModeToggled event and rejects unknown fields', () => {
    expect(
      DiagnosticEventSchema.safeParse({
        type: 'sendKeyModeToggled',
        key: 'alt+enter',
        applied: true,
        mode: 'enter',
      }).success,
    ).toBe(true);
    // The no-op (pre-hydration) shape: applied false, no mode.
    expect(
      DiagnosticEventSchema.safeParse({
        type: 'sendKeyModeToggled',
        key: 'alt+enter',
        applied: false,
      }).success,
    ).toBe(true);
    // strictObject rejects an unknown field, so no content can ride along.
    expect(
      DiagnosticEventSchema.safeParse({
        type: 'sendKeyModeToggled',
        key: 'alt+enter',
        applied: true,
        text: 'oops',
      }).success,
    ).toBe(false);
  });

  it('accepts the remaining content-safe variants', () => {
    expect(
      DiagnosticEventSchema.parse({
        type: 'roleJumpResolved',
        key: 'alt+a',
        role: 'user',
        found: true,
      }).type,
    ).toBe('roleJumpResolved');
    expect(DiagnosticEventSchema.parse({ type: 'stopRequested', key: 'mod+.' }).type).toBe(
      'stopRequested',
    );
    expect(
      DiagnosticEventSchema.parse({
        type: 'quickNavKeypress',
        key: 'alt+1',
        slot: 1,
        press: 'single',
      }).type,
    ).toBe('quickNavKeypress');
    expect(DiagnosticEventSchema.parse({ type: 'logsDropped', count: 3 }).type).toBe('logsDropped');
    expect(DiagnosticEventSchema.parse({ type: 'logTransportError', status: 503 }).type).toBe(
      'logTransportError',
    );
  });

  it('accepts the settings load outcome variants and rejects extra fields', () => {
    expect(DiagnosticEventSchema.parse({ type: 'settingsReloaded' }).type).toBe('settingsReloaded');
    expect(DiagnosticEventSchema.parse({ type: 'settingsLoadDegraded' }).type).toBe(
      'settingsLoadDegraded',
    );
    // strictObject rejects an unknown field, so no content can ride along.
    expect(
      DiagnosticEventSchema.safeParse({ type: 'settingsReloaded', detail: 'oops' }).success,
    ).toBe(false);
    expect(
      DiagnosticEventSchema.safeParse({ type: 'settingsLoadDegraded', detail: 'oops' }).success,
    ).toBe(false);
  });

  it('accepts the keyboardShortcutsOpened event and rejects extra fields (content-safety)', () => {
    expect(DiagnosticEventSchema.parse({ type: 'keyboardShortcutsOpened' }).type).toBe(
      'keyboardShortcutsOpened',
    );
    // strictObject must reject any free-form field so no content can ride along.
    expect(
      DiagnosticEventSchema.safeParse({ type: 'keyboardShortcutsOpened', text: 'oops' }).success,
    ).toBe(false);
  });

  it('accepts milestone text on a content-bearing code', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'milestone',
      code: 'notify-error',
      text: 'network failed',
    });
    expect(parsed.type).toBe('milestone');
  });
  it('rejects milestone text on a non-content-bearing code (content-safety)', () => {
    expect(
      DiagnosticEventSchema.safeParse({ type: 'milestone', code: 'app-mounted', text: 'leak' })
        .success,
    ).toBe(false);
  });
  it('rejects milestone text longer than the cap', () => {
    expect(
      DiagnosticEventSchema.safeParse({
        type: 'milestone',
        code: 'notify-error',
        text: 'x'.repeat(MAX_MILESTONE_TEXT + 1),
      }).success,
    ).toBe(false);
  });
  it('still accepts a milestone with no text', () => {
    expect(DiagnosticEventSchema.parse({ type: 'milestone', code: 'app-mounted' }).type).toBe(
      'milestone',
    );
  });
});

describe('DiagnosticBatchSchema', () => {
  it('accepts a bounded batch of envelope-wrapped entries', () => {
    const parsed = DiagnosticBatchSchema.parse({
      entries: [{ ...envelope, event: { type: 'milestone', code: 'app-mounted' } }],
    });
    expect(parsed.entries).toHaveLength(1);
  });

  it('rejects an entry missing its envelope seq/at', () => {
    expect(() =>
      DiagnosticBatchSchema.parse({
        entries: [{ event: { type: 'milestone', code: 'app-mounted' } }],
      }),
    ).toThrow();
  });

  it('rejects an empty batch and an oversized batch', () => {
    expect(() => DiagnosticBatchSchema.parse({ entries: [] })).toThrow();
    const tooMany = Array.from({ length: 101 }, () => ({
      ...envelope,
      event: { type: 'milestone' as const, code: 'app-mounted' as const },
    }));
    expect(() => DiagnosticBatchSchema.parse({ entries: tooMany })).toThrow();
  });
});
