import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useSendKeyModeToggle } from './useSendKeyModeToggle';
import type { RedactedSettings } from '@anvika/shared/settings/redact';
import { logDiag } from '../../diagnostics/logDiag';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useSettingsStore } from '../../stores/settingsStore';

vi.mock('../../lib/keyboard/keyboardHelpers', () => ({ isMac: () => false }));
vi.mock('../../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

const events: NotificationEvent[] = [];
beforeEach(() => {
  events.length = 0;
  vi.mocked(logDiag).mockClear();
  registerChannel((e) => events.push(e));
});
afterEach(() => {
  resetChannels();
  useSettingsStore.setState({ settings: null });
});

it('flips the mode, persists silently, announces, and logs an applied diagnostic when ready', () => {
  const patch = vi.fn();
  useSettingsStore.setState({ settings: { sendKeyMode: 'modEnter' } as RedactedSettings, patch });
  const { result } = renderHook(() => useSendKeyModeToggle());
  result.current('alt+enter');
  expect(patch).toHaveBeenCalledWith({ sendKeyMode: 'enter' }, expect.any(Function), {
    announce: false,
  });
  expect(events).toContainEqual({ type: 'sendKeyModeChanged', mode: 'enter', isMac: false });
  expect(vi.mocked(logDiag)).toHaveBeenCalledWith({
    type: 'sendKeyModeToggled',
    key: 'alt+enter',
    applied: true,
    mode: 'enter',
  });
});

it('logs applied:false, speaks settingsNotReady, and does not patch when not hydrated', () => {
  const patch = vi.fn();
  useSettingsStore.setState({ settings: null, patch });
  const { result } = renderHook(() => useSendKeyModeToggle());
  result.current('alt+enter');
  expect(patch).not.toHaveBeenCalled();
  expect(events).toContainEqual({ type: 'settingsNotReady' });
  expect(events.some((e) => e.type === 'sendKeyModeChanged')).toBe(false);
  expect(vi.mocked(logDiag)).toHaveBeenCalledWith({
    type: 'sendKeyModeToggled',
    key: 'alt+enter',
    applied: false,
  });
});
