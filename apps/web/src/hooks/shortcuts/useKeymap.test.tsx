import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import { useKeymap } from './useKeymap';

const mockSettings = { hotkeyBindings: {} as Record<string, string> };
vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) => selector({ settings: mockSettings }),
}));

afterEach(() => {
  mockSettings.hotkeyBindings = {};
});

describe('useKeymap', () => {
  it('returns the full default keymap with no overrides', () => {
    const { result } = renderHook(() => useKeymap());
    expect(result.current).toEqual(DEFAULT_KEYMAP);
  });
  it('merges overrides over defaults', () => {
    mockSettings.hotkeyBindings = { stop: 'shift+x' };
    const { result } = renderHook(() => useKeymap());
    expect(result.current.stop).toBe('shift+x');
    expect(result.current.jumpToComposer).toBe(DEFAULT_KEYMAP.jumpToComposer);
  });
});
