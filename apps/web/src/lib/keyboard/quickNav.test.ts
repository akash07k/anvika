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
import { handleQuickNavPress } from './quickNav';

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

describe('handleQuickNavPress', () => {
  it('emits a single-press resolution and the keypress trace, and reads (no focus)', () => {
    const lastPress = { current: null as { slot: number; at: number } | null };
    handleQuickNavPress({
      key: 'alt+1',
      slot: 1,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(focusMessage).not.toHaveBeenCalled();
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quickNavResolved',
        slot: 1,
        press: 'single',
        found: true,
        messageId: 'a1',
      }),
    );
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickNavKeypress', slot: 1, press: 'single' }),
    );
  });

  it('on a same-slot double press within the window, focuses and emits a double resolution', () => {
    const lastPress = { current: { slot: 1, at: 900 } };
    handleQuickNavPress({
      key: 'alt+1',
      slot: 1,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(focusMessage).toHaveBeenCalledWith('a1');
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quickNavResolved',
        press: 'double',
        found: true,
        messageId: 'a1',
      }),
    );
  });

  it('on a same-slot double press when the message is already focused, speaks "already here", logs alreadyFocused:true, and does NOT re-focus', () => {
    isMessageFocused.mockReturnValue(true);
    const lastPress = { current: { slot: 1, at: 900 } };
    handleQuickNavPress({
      key: 'alt+1',
      slot: 1,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(notify).toHaveBeenCalledWith({ type: 'quickNavAlreadyFocused' });
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quickNavResolved',
        press: 'double',
        found: true,
        messageId: 'a1',
        alreadyFocused: true,
      }),
    );
    expect(focusMessage).not.toHaveBeenCalled();
  });

  it('on a same-slot double press when the message is NOT already focused, focuses normally and does NOT set alreadyFocused', () => {
    isMessageFocused.mockReturnValue(false);
    const lastPress = { current: { slot: 1, at: 900 } };
    handleQuickNavPress({
      key: 'alt+1',
      slot: 1,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(focusMessage).toHaveBeenCalledWith('a1');
    expect(notify).not.toHaveBeenCalledWith({ type: 'quickNavAlreadyFocused' });
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'quickNavResolved',
        press: 'double',
        found: true,
        messageId: 'a1',
      }),
    );
    // alreadyFocused must NOT appear on the normal double-press diagnostic
    const resolvedCall = logDiag.mock.calls.find((c) => c[0]?.type === 'quickNavResolved')?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(resolvedCall?.['alreadyFocused']).toBeUndefined();
  });

  it('treats a same-slot press OUTSIDE the window as a single press (no focus)', () => {
    const lastPress = { current: { slot: 1, at: 100 } };
    handleQuickNavPress({
      key: 'alt+1',
      slot: 1,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(focusMessage).not.toHaveBeenCalled();
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickNavResolved', press: 'single' }),
    );
  });

  it('treats a DIFFERENT-slot press within the window as a single press (no focus)', () => {
    const lastPress = { current: { slot: 1, at: 900 } };
    handleQuickNavPress({
      key: 'alt+2',
      slot: 2,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(focusMessage).not.toHaveBeenCalled();
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickNavResolved', slot: 2, press: 'single' }),
    );
  });

  it('on an empty slot, notifies and emits found:false', () => {
    const lastPress = { current: null as { slot: number; at: number } | null };
    handleQuickNavPress({
      key: 'alt+5',
      slot: 5,
      messages: msgs(),
      lastPress,
      now: 1000,
      doublePressMs: 500,
      read: () => 'desc',
    });
    expect(notify).toHaveBeenCalledWith({ type: 'quickNavEmpty' });
    expect(logDiag).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quickNavResolved', slot: 5, found: false, total: 2 }),
    );
  });
});
