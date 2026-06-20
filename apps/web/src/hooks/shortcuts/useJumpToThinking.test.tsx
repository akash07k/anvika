import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { messageDomId } from '../../lib/message/anvikaMessage';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

import { useJumpToThinking } from './useJumpToThinking';

const events: NotificationEvent[] = [];

beforeEach(() => {
  events.length = 0;
  registerChannel((e) => events.push(e));
});

afterEach(() => {
  resetChannels();
  // Clean up any DOM elements added by the test.
  document.body.innerHTML = '';
});

const assistantMessage: AnvikaUIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Hello' }],
};

describe('useJumpToThinking', () => {
  it('focuses the thinking summary element when it exists on the latest message', () => {
    const messages: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      assistantMessage,
    ];
    const index = messages.length - 1;
    const domId = messageDomId(assistantMessage, index);
    // Create the thinking summary element that MessageReasoning renders.
    const summary = document.createElement('summary');
    summary.id = `thinking-${domId}`;
    summary.tabIndex = -1;
    document.body.appendChild(summary);

    const { result } = renderHook(() => useJumpToThinking(messages));
    act(() => result.current());

    expect(document.activeElement).toBe(summary);
    expect(events).toHaveLength(0);
  });

  it('notifies noThinkingToJumpTo when the latest message has no thinking element', () => {
    const messages: AnvikaUIMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      assistantMessage,
    ];
    // No element in the DOM with the thinking id.

    const { result } = renderHook(() => useJumpToThinking(messages));
    act(() => result.current());

    expect(document.activeElement).not.toHaveAttribute('id', expect.stringContaining('thinking-'));
    expect(events).toContainEqual({ type: 'noThinkingToJumpTo' });
  });

  it('notifies noThinkingToJumpTo when messages is empty', () => {
    const { result } = renderHook(() => useJumpToThinking([]));
    act(() => result.current());
    expect(events).toContainEqual({ type: 'noThinkingToJumpTo' });
  });

  it('focuses the prior assistant thinking region when the last message is a user message', () => {
    // Scenario: user just sent a message; the previous assistant turn has a rendered thinking
    // region. Alt+R must skip the user-role last message and focus the assistant's thinking.
    const assistant: AnvikaUIMessage = { id: 'a1', role: 'assistant', parts: [] };
    const user: AnvikaUIMessage = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'hi' }] };
    const messages: AnvikaUIMessage[] = [assistant, user];
    // assistant is at index 0; user is at index 1 (the last message).
    const assistantDomId = messageDomId(assistant, 0);
    const summary = document.createElement('summary');
    summary.id = `thinking-${assistantDomId}`;
    summary.tabIndex = -1;
    document.body.appendChild(summary);

    const { result } = renderHook(() => useJumpToThinking(messages));
    act(() => result.current());

    expect(document.activeElement).toBe(summary);
    expect(events).toHaveLength(0);
  });

  it('announces no-op when the latest assistant has no thinking region even if an older one did', () => {
    // Deliberate "latest assistant only" behavior: once the backward scan finds the most recent
    // assistant message and it has no thinking region, it stops and announces the no-op. It does
    // NOT continue to older assistant turns.
    const older: AnvikaUIMessage = { id: 'a0', role: 'assistant', parts: [] };
    const newer: AnvikaUIMessage = { id: 'a2', role: 'assistant', parts: [] };
    const messages: AnvikaUIMessage[] = [older, newer];
    // Give only the older assistant a rendered thinking element.
    const olderDomId = messageDomId(older, 0);
    const summary = document.createElement('summary');
    summary.id = `thinking-${olderDomId}`;
    summary.tabIndex = -1;
    document.body.appendChild(summary);
    // The newer assistant (index 1) has no thinking element in the DOM.

    const { result } = renderHook(() => useJumpToThinking(messages));
    act(() => result.current());

    // Must NOT focus the older assistant's thinking; must announce the no-op.
    expect(document.activeElement).not.toBe(summary);
    expect(events).toContainEqual({ type: 'noThinkingToJumpTo' });
  });
});
