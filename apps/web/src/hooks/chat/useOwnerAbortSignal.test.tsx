import { StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useOwnerAbortSignal } from './useOwnerAbortSignal';

function StrictModeWrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

describe('useOwnerAbortSignal', () => {
  it('returns a live signal after StrictMode remounting and aborts it on unmount', () => {
    const { result, unmount } = renderHook(() => useOwnerAbortSignal(), {
      wrapper: StrictModeWrapper,
    });

    const signal = result.current;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
