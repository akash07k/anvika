import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('focuses the latest message heading for a new request', () => {
    const msg = makeMessage('a1');
    const domId = `message-${messageDomId(msg, 0)}`;
    el.id = domId;
    document.body.appendChild(el);

    const messages: AnvikaUIMessage[] = [msg];
    const { rerender } = renderHook(
      ({ focusRequest }) => useFocusOnCompletion(messages, focusRequest),
      { initialProps: { focusRequest: 0 } },
    );

    rerender({ focusRequest: 1 });

    expect(el).toHaveFocus();
  });

  it('does nothing before a focus request', () => {
    const msg = makeMessage('b1');
    const domId = `message-${messageDomId(msg, 0)}`;
    el.id = domId;
    document.body.appendChild(el);

    const messages: AnvikaUIMessage[] = [msg];

    renderHook(() => useFocusOnCompletion(messages, 0));

    expect(el).not.toHaveFocus();
  });

  it('consumes a request only once', () => {
    const msg = makeMessage('c1');
    const domId = `message-${messageDomId(msg, 0)}`;
    el.id = domId;
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    const { rerender } = renderHook(
      ({ messages, focusRequest }) => useFocusOnCompletion(messages, focusRequest),
      { initialProps: { messages: [msg], focusRequest: 1 } },
    );

    rerender({ messages: [{ ...msg }], focusRequest: 1 });

    expect(focus).toHaveBeenCalledOnce();
  });

  it('waits for a later message render when the requested heading is not mounted', () => {
    const first = makeMessage('d1');
    const latest = makeMessage('d2');
    const latestDomId = `message-${messageDomId(latest, 1)}`;
    const { rerender } = renderHook(
      ({ messages, focusRequest }) => useFocusOnCompletion(messages, focusRequest),
      { initialProps: { messages: [first], focusRequest: 1 } },
    );

    el.id = latestDomId;
    document.body.appendChild(el);
    rerender({ messages: [first, latest], focusRequest: 1 });

    expect(el).toHaveFocus();
  });
});
