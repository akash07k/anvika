import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useChatFinishHandler } from './useChatFinishHandler';

const events: NotificationEvent[] = [];
const message: AnvikaUIMessage = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'Done' }],
};

beforeEach(() => {
  events.length = 0;
  registerChannel((event) => events.push(event));
});

afterEach(() => {
  resetChannels();
});

describe('useChatFinishHandler', () => {
  it('requests completion focus only after a successful turn in move mode', () => {
    const onFocusRequested = vi.fn();
    const onTurnFinished = vi.fn();
    const { result } = renderHook(() =>
      useChatFinishHandler({
        readWhole: false,
        focusMode: 'move',
        onFocusRequested,
        onTurnFinished,
      }),
    );

    result.current({ isAbort: false, isError: false, message });

    expect(events).toContainEqual({ type: 'generationComplete', text: 'Done', readWhole: false });
    expect(onTurnFinished).toHaveBeenCalledOnce();
    expect(onFocusRequested).toHaveBeenCalledOnce();
  });

  it('does not request focus for aborted or failed turns', () => {
    const onFocusRequested = vi.fn();
    const onTurnFinished = vi.fn();
    const { result } = renderHook(() =>
      useChatFinishHandler({
        readWhole: true,
        focusMode: 'move',
        onFocusRequested,
        onTurnFinished,
      }),
    );

    result.current({ isAbort: true, isError: false, message });
    result.current({ isAbort: false, isError: true, message });

    expect(events).toContainEqual({ type: 'generationStopped' });
    expect(onTurnFinished).not.toHaveBeenCalled();
    expect(onFocusRequested).not.toHaveBeenCalled();
  });
});
