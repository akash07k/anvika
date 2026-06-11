import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChatScope } from './useChatScope';

const enableScope = vi.fn();
const disableScope = vi.fn();

// Stub the hotkeys context so the scope lifecycle is observed in isolation, without a provider.
vi.mock('react-hotkeys-hook', () => ({
  useHotkeysContext: () => ({ enableScope, disableScope }),
}));

afterEach(() => {
  enableScope.mockClear();
  disableScope.mockClear();
});

describe('useChatScope', () => {
  it('enables the chat scope on mount and disables it on unmount', () => {
    const { unmount } = renderHook(() => useChatScope());

    expect(enableScope).toHaveBeenCalledWith('chat');
    expect(disableScope).not.toHaveBeenCalled();

    unmount();

    expect(disableScope).toHaveBeenCalledWith('chat');
  });
});
