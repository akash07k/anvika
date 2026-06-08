import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { messageDomId } from '../../lib/message/anvikaMessage';
import { useFocusOnCompletion } from './useFocusOnCompletion';

// Build a minimal AnvikaUIMessage with only the fields the hook and messageDomId read.
function makeMessage(id: string): AnvikaUIMessage {
  return {
    id,
    role: 'assistant',
    parts: [{ type: 'text', text: 'Hi' }],
  } as AnvikaUIMessage;
}

describe('useFocusOnCompletion', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
    el.setAttribute('tabindex', '-1');
  });

  afterEach(() => {
    el.remove();
  });

  it('focuses the latest message heading when pending.current is true', () => {
    const msg = makeMessage('a1');
    const domId = `message-${messageDomId(msg, 0)}`;
    el.id = domId;
    document.body.appendChild(el);

    const messages: AnvikaUIMessage[] = [msg];
    const pending = { current: true };

    renderHook(() => useFocusOnCompletion(messages, pending));

    expect(el).toHaveFocus();
    expect(pending.current).toBe(false);
  });

  it('does nothing when pending.current is false', () => {
    const msg = makeMessage('b1');
    const domId = `message-${messageDomId(msg, 0)}`;
    el.id = domId;
    document.body.appendChild(el);

    const messages: AnvikaUIMessage[] = [msg];
    const pending = { current: false };

    renderHook(() => useFocusOnCompletion(messages, pending));

    expect(el).not.toHaveFocus();
    expect(pending.current).toBe(false);
  });
});
