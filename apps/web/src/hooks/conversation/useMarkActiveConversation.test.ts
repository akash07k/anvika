import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as mutations from '../../lib/conversation/conversationMutations';
import { useMarkActiveConversation } from './useMarkActiveConversation';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMarkActiveConversation', () => {
  it('persists the active pointer when an existing conversation is shown', async () => {
    const spy = vi.spyOn(mutations, 'setActiveConversation').mockResolvedValue(undefined);
    renderHook(() => useMarkActiveConversation('abc-123', true));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('abc-123'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT persist for a draft (exists false), whose id has no row yet', () => {
    const spy = vi.spyOn(mutations, 'setActiveConversation').mockResolvedValue(undefined);
    renderHook(() => useMarkActiveConversation('draft-1', false));
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-persists when the shown conversation id changes', async () => {
    const spy = vi.spyOn(mutations, 'setActiveConversation').mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useMarkActiveConversation(id, true),
      { initialProps: { id: 'first-1' } },
    );
    await waitFor(() => expect(spy).toHaveBeenCalledWith('first-1'));
    rerender({ id: 'second-2' });
    await waitFor(() => expect(spy).toHaveBeenCalledWith('second-2'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('swallows a failed write (best-effort) without throwing', async () => {
    const spy = vi
      .spyOn(mutations, 'setActiveConversation')
      .mockRejectedValue(new Error('active PUT failed'));
    expect(() => renderHook(() => useMarkActiveConversation('abc-123', true))).not.toThrow();
    await waitFor(() => expect(spy).toHaveBeenCalledWith('abc-123'));
  });
});
