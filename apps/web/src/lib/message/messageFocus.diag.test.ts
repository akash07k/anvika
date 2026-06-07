import { afterEach, describe, expect, it, vi } from 'vitest';

const { logDiag } = vi.hoisted(() => ({ logDiag: vi.fn() }));
vi.mock('../../diagnostics/logDiag', () => ({ logDiag }));

import { focusMessage } from './messageFocus';

afterEach(() => {
  logDiag.mockClear();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('focusMessage diagnostics', () => {
  it('emits skipped-empty-id for an empty id (the original-bug smoking gun)', () => {
    focusMessage('');
    expect(logDiag).toHaveBeenCalledWith({
      type: 'focusOutcome',
      domId: '(empty)',
      outcome: 'skipped-empty-id',
    });
  });

  it('emits element-not-found when no matching heading exists', () => {
    vi.useFakeTimers();
    focusMessage('pos-9');
    vi.runAllTimers();
    expect(logDiag).toHaveBeenCalledWith({
      type: 'focusOutcome',
      domId: 'pos-9',
      outcome: 'element-not-found',
    });
  });

  it('emits focused when the heading receives focus', () => {
    vi.useFakeTimers();
    const h = document.createElement('h2');
    h.id = 'message-msg_a';
    h.tabIndex = -1;
    document.body.appendChild(h);
    focusMessage('msg_a');
    vi.runAllTimers();
    expect(logDiag).toHaveBeenCalledWith({
      type: 'focusOutcome',
      domId: 'msg_a',
      outcome: 'focused',
    });
  });

  it('emits focus-failed when the element cannot receive focus', () => {
    vi.useFakeTimers();
    const span = document.createElement('span'); // not focusable (no tabindex)
    span.id = 'message-msg_b';
    document.body.appendChild(span);
    focusMessage('msg_b');
    vi.runAllTimers();
    expect(logDiag).toHaveBeenCalledWith({
      type: 'focusOutcome',
      domId: 'msg_b',
      outcome: 'focus-failed',
    });
  });
});
