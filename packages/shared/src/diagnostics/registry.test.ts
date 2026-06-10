import { describe, expect, it } from 'vitest';

import { diagnosticMeta } from './registry';

describe('diagnosticMeta', () => {
  it('maps a keyboard event to the client.keyboard category at info', () => {
    const meta = diagnosticMeta({
      type: 'quickNavResolved',
      key: 'alt+1',
      slot: 1,
      press: 'double',
      found: true,
      total: 4,
      messageId: 'msg_a',
      role: 'assistant',
      index: 3,
    });
    expect(meta.category).toEqual(['keyboard']);
    expect(meta.level).toBe('info');
    expect(meta.message.length).toBeGreaterThan(0);
  });

  it('maps focusOutcome to the focus category at info', () => {
    const meta = diagnosticMeta({ type: 'focusOutcome', domId: 'message-x', outcome: 'focused' });
    expect(meta.category).toEqual(['focus']);
    expect(meta.level).toBe('info');
  });

  it('maps the per-keystroke trace to debug', () => {
    const meta = diagnosticMeta({
      type: 'quickNavKeypress',
      key: 'alt+1',
      slot: 1,
      press: 'single',
    });
    expect(meta.level).toBe('debug');
  });

  it('classifies sendKeyModeToggled as an info-level keyboard event', () => {
    const meta = diagnosticMeta({
      type: 'sendKeyModeToggled',
      key: 'alt+enter',
      applied: true,
      mode: 'enter',
    });
    expect(meta).toEqual({
      category: ['keyboard'],
      level: 'info',
      message: 'Send key mode toggled',
    });
  });

  it('derives milestone level from the code (error to warning, else info)', () => {
    expect(diagnosticMeta({ type: 'milestone', code: 'notify-error' }).level).toBe('warning');
    expect(diagnosticMeta({ type: 'milestone', code: 'app-mounted' }).level).toBe('info');
    expect(diagnosticMeta({ type: 'milestone', code: 'notify-error' }).category).toEqual([]);
  });

  it('maps the partial-failure connection save milestone to warning', () => {
    const meta = diagnosticMeta({ type: 'milestone', code: 'notify-connection-save-failed' });
    expect(meta.level).toBe('warning');
    expect(meta.category).toEqual([]);
    expect(meta.message.length).toBeGreaterThan(0);
  });

  it('maps the conversation rename/delete/batch-delete/pin/branch failure milestones to warning', () => {
    for (const code of [
      'notify-conversation-rename-failed',
      'notify-conversation-delete-failed',
      'notify-conversations-batch-delete-failed',
      'notify-conversation-pin-failed',
      'notify-conversation-branch-failed',
    ] as const) {
      const meta = diagnosticMeta({ type: 'milestone', code });
      expect(meta.level).toBe('warning');
      expect(meta.message.length).toBeGreaterThan(0);
    }
  });

  it('maps the failed per-message action milestone to warning', () => {
    const meta = diagnosticMeta({ type: 'milestone', code: 'notify-message-action-failed' });
    expect(meta.level).toBe('warning');
    expect(meta.message.length).toBeGreaterThan(0);
  });

  it('keeps the edit-unavailable-while-generating guard milestone at info', () => {
    const meta = diagnosticMeta({
      type: 'milestone',
      code: 'notify-edit-unavailable-while-generating',
    });
    expect(meta.level).toBe('info');
    expect(meta.message.length).toBeGreaterThan(0);
  });

  it('keeps the conversation success milestones at info', () => {
    for (const code of [
      'notify-conversation-created',
      'notify-conversation-renamed',
      'notify-conversation-deleted',
      'notify-conversations-batch-deleted',
      'notify-conversation-pinned',
      'notify-conversation-unpinned',
      'notify-conversation-branched',
      'notify-message-regenerating',
      'notify-message-edited',
      'notify-message-edit-started',
      'notify-latest-message-edit-started',
      'notify-message-edit-cancelled',
    ] as const) {
      expect(diagnosticMeta({ type: 'milestone', code }).level).toBe('info');
    }
  });

  it('maps transport self-reports to warning', () => {
    expect(diagnosticMeta({ type: 'logsDropped', count: 5 }).level).toBe('warning');
    expect(diagnosticMeta({ type: 'logTransportError', status: 400 }).level).toBe('warning');
  });

  it('classifies the settings load outcomes under the settings category', () => {
    expect(diagnosticMeta({ type: 'settingsReloaded' })).toEqual({
      category: ['settings'],
      level: 'info',
      message: 'Settings reloaded',
    });
    expect(diagnosticMeta({ type: 'settingsLoadDegraded' })).toEqual({
      category: ['settings'],
      level: 'warning',
      message: 'Settings load degraded; using defaults',
    });
  });
});

describe('diagnosticMeta clientError', () => {
  it('classifies clientError under the error category at error level', () => {
    const meta = diagnosticMeta({ type: 'clientError', name: 'TypeError' });
    expect(meta.category).toEqual(['error']);
    expect(meta.level).toBe('error');
    expect(meta.message).toBe('Client error');
  });
});
