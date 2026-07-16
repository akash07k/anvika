import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { useCrossTabSync } from './useCrossTabSync';

vi.mock('./useDeletedElsewhere', () => ({
  useDeletedElsewhere: vi.fn(() => false),
}));

vi.mock('./useSyncMessagesFromDetail', () => ({
  useSyncMessagesFromDetail: vi.fn(),
}));

import { useDeletedElsewhere } from './useDeletedElsewhere';
import { useSyncMessagesFromDetail } from './useSyncMessagesFromDetail';

afterEach(() => vi.clearAllMocks());

describe('useCrossTabSync', () => {
  it('delegates to useDeletedElsewhere with (conversationId, isBusy)', () => {
    const setMessages = vi.fn();
    renderHook(() =>
      useCrossTabSync({
        conversationId: 'abc-123',
        isBusy: true,
        isEditing: false,
        messages: [],
        setMessages,
      }),
    );
    expect(useDeletedElsewhere).toHaveBeenCalledWith('abc-123', true);
  });

  it('delegates to useSyncMessagesFromDetail with the full input bag', () => {
    const setMessages = vi.fn();
    const messages: AnvikaUIMessage[] = [];
    renderHook(() =>
      useCrossTabSync({
        conversationId: 'abc-123',
        isBusy: false,
        isEditing: true,
        messages,
        setMessages,
      }),
    );
    expect(useSyncMessagesFromDetail).toHaveBeenCalledOnce();
    expect(useSyncMessagesFromDetail).toHaveBeenCalledWith({
      conversationId: 'abc-123',
      isBusy: false,
      isEditing: true,
      messages,
      setMessages,
    });
  });

  it('returns { deletedElsewhere } equal to the useDeletedElsewhere return value', () => {
    vi.mocked(useDeletedElsewhere).mockReturnValue(true);
    const { result } = renderHook(() =>
      useCrossTabSync({
        conversationId: 'xyz-999',
        isBusy: false,
        isEditing: false,
        messages: [],
        setMessages: vi.fn(),
      }),
    );
    expect(result.current).toEqual({ deletedElsewhere: true });
  });
});
