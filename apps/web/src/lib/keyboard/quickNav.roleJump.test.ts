import { afterEach, describe, expect, it, vi } from 'vitest';

const { logDiag, focusMessage, isMessageFocused, notify } = vi.hoisted(() => ({
  logDiag: vi.fn(),
  focusMessage: vi.fn(),
  isMessageFocused: vi.fn(() => false),
  notify: vi.fn(),
}));
vi.mock('../../diagnostics/logDiag', () => ({ logDiag }));
vi.mock('../message/messageFocus', () => ({ focusMessage, isMessageFocused }));
vi.mock('../../notifications/notifier', () => ({ notify }));

import type { AnvikaUIMessage } from '../message/anvikaMessage';
import { handleRoleJump } from './quickNav';

function msgs(): AnvikaUIMessage[] {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'yo' }] },
  ] as unknown as AnvikaUIMessage[];
}

afterEach(() => {
  logDiag.mockClear();
  focusMessage.mockClear();
  isMessageFocused.mockClear();
  isMessageFocused.mockReturnValue(false);
  notify.mockClear();
});

describe('handleRoleJump', () => {
  it('focuses the latest assistant and emits found:true', () => {
    handleRoleJump({ key: 'alt+a', role: 'assistant', messages: msgs() });
    expect(focusMessage).toHaveBeenCalledWith('a1');
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'roleJumpResolved',
        role: 'assistant',
        found: true,
        messageId: 'a1',
      }),
    );
  });

  it('notifies and emits found:false when the role is absent', () => {
    const onlyUser = [msgs()[0]] as AnvikaUIMessage[];
    handleRoleJump({ key: 'alt+a', role: 'assistant', messages: onlyUser });
    expect(notify).toHaveBeenCalledWith({ type: 'noMessageForRole', role: 'assistant' });
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'roleJumpResolved', role: 'assistant', found: false }),
    );
  });
});
