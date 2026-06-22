import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  detectIsMac,
  formatBinding,
  isMac,
  resolveSendBinding,
  toAriaKeyShortcuts,
  type PlatformNavigator,
} from './keyboardHelpers';

afterEach(() => vi.unstubAllGlobals());

describe('detectIsMac', () => {
  it('is true for a Mac userAgentData platform (modern UA-CH)', () => {
    expect(detectIsMac({ userAgentData: { platform: 'macOS' } } as PlatformNavigator)).toBe(true);
  });
  it('falls back to userAgent + platform when userAgentData is absent', () => {
    expect(detectIsMac({ platform: 'MacIntel' } as PlatformNavigator)).toBe(true);
    expect(detectIsMac({ userAgent: 'Mozilla/5.0 (Macintosh)' } as PlatformNavigator)).toBe(true);
    expect(detectIsMac({ platform: 'Win32' } as PlatformNavigator)).toBe(false);
  });
  it('is false when nothing identifies the platform', () => {
    expect(detectIsMac({} as PlatformNavigator)).toBe(false);
  });
});

describe('isMac', () => {
  it('is true for a Mac user agent', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' });
    expect(isMac()).toBe(true);
  });

  it('is false for a Windows user agent', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    expect(isMac()).toBe(false);
  });
});

describe('resolveSendBinding', () => {
  it("returns the literal 'enter' in enter mode regardless of the configured binding", () => {
    expect(resolveSendBinding('enter', 'mod+enter')).toBe('enter');
    expect(resolveSendBinding('enter', 'ctrl+enter, meta+enter')).toBe('enter');
  });

  it('returns the configured send binding in modEnter mode', () => {
    expect(resolveSendBinding('modEnter', 'mod+enter')).toBe('mod+enter');
    expect(resolveSendBinding('modEnter', 'ctrl+enter, meta+enter')).toBe('ctrl+enter, meta+enter');
  });
});

describe('toAriaKeyShortcuts', () => {
  it('maps a single modifier chord to ARIA-canonical tokens', () => {
    expect(toAriaKeyShortcuts('alt+n')).toBe('Alt+N');
    expect(toAriaKeyShortcuts('shift+escape')).toBe('Shift+Escape');
    expect(toAriaKeyShortcuts('alt+/')).toBe('Alt+/');
  });

  it('uses the ARIA modifier names (Control/Meta), not the cheatsheet labels (Ctrl/Cmd)', () => {
    expect(toAriaKeyShortcuts('ctrl+enter')).toBe('Control+Enter');
    expect(toAriaKeyShortcuts('meta+enter')).toBe('Meta+Enter');
  });

  it('joins comma-separated alternatives with a space (the ARIA multi-shortcut form)', () => {
    expect(toAriaKeyShortcuts('ctrl+enter, meta+enter')).toBe('Control+Enter Meta+Enter');
  });

  it('trims whitespace and ignores empty alternatives', () => {
    expect(toAriaKeyShortcuts('  alt+n ,')).toBe('Alt+N');
  });
});

describe('formatBinding', () => {
  it('maps tokens within a chord', () => {
    expect(formatBinding('shift+escape', false)).toBe('Shift+Esc');
    expect(formatBinding('alt+enter', false)).toBe('Alt+Enter');
    expect(formatBinding('alt+a', false)).toBe('Alt+A');
    expect(formatBinding('alt+0', false)).toBe('Alt+0');
    expect(formatBinding('alt+/', false)).toBe('Alt+/');
    // react-hotkeys-hook maps e.code 'Slash' -> 'slash' via its L() normalizer, so the binding
    // token in DEFAULT_KEYMAP is 'alt+slash'. Display it as 'Alt+/' (not 'Alt+SLASH').
    expect(formatBinding('alt+slash', false)).toBe('Alt+/');
  });

  it('picks the platform chord for a ctrl/meta-paired binding', () => {
    expect(formatBinding('ctrl+enter, meta+enter', false)).toBe('Ctrl+Enter');
    expect(formatBinding('ctrl+enter, meta+enter', true)).toBe('Cmd+Enter');
  });

  it('joins non-paired alternatives with " or "', () => {
    expect(formatBinding('alt+a, alt+b', false)).toBe('Alt+A or Alt+B');
  });

  it('handles a lone meta or ctrl chord without a pair', () => {
    expect(formatBinding('meta+k', true)).toBe('Cmd+K');
    expect(formatBinding('ctrl+k', false)).toBe('Ctrl+K');
  });
});
