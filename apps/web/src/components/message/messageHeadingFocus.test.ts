import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { focusedMessageDomId, restoreFocusAfterReseed } from './messageHeadingFocus';

const M = (id: string): AnvikaUIMessage => ({ id, role: 'user', parts: [] }) as AnvikaUIMessage;

function heading(domId: string): HTMLElement {
  const el = document.createElement('h2');
  el.id = `message-${domId}`;
  el.tabIndex = -1;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('focusedMessageDomId', () => {
  it('reads the domId from the focused message heading', () => {
    const h = heading('jwq-112');
    h.focus();
    expect(focusedMessageDomId()).toBe('jwq-112');
  });

  it('returns null when focus is not on a message heading', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    expect(focusedMessageDomId()).toBeNull();
  });
});

describe('restoreFocusAfterReseed', () => {
  it('does nothing when the focused message survives the re-seed', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (cb(0), 0));
    heading('a');
    const b = heading('b');
    b.focus();
    restoreFocusAfterReseed('b', [M('a'), M('b')]);
    expect(document.activeElement).toBe(b);
  });

  it('moves focus to the new last heading when the focused message was truncated away', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (cb(0), 0));
    const a = heading('a');
    const b = heading('b');
    b.focus();
    // A remote edit truncated [a, b] down to [a]; b is gone, so focus moves to the new last heading.
    restoreFocusAfterReseed('b', [M('a')]);
    expect(document.activeElement).toBe(a);
  });

  it('no-ops when nothing relevant had focus', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (cb(0), 0));
    expect(() => restoreFocusAfterReseed(null, [M('a')])).not.toThrow();
  });
});
