import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIsMac } from './useIsMac';

afterEach(() => vi.unstubAllGlobals());

describe('useIsMac', () => {
  it('is true when navigator reports a Mac platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' });
    const { result } = renderHook(() => useIsMac());
    expect(result.current).toBe(true);
  });

  it('is false when navigator reports a non-Mac platform', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)' });
    const { result } = renderHook(() => useIsMac());
    expect(result.current).toBe(false);
  });
});
