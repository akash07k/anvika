import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeComposerFocus } from './composerFocusIntent';
import { navigateToConversationAndFocusComposer } from './navigateToConversation';

afterEach(() => {
  consumeComposerFocus('conv-1');
});

describe('navigateToConversationAndFocusComposer', () => {
  it('requests an intent scoped to the target conversation and navigates to its route', () => {
    const navigate = vi.fn();
    navigateToConversationAndFocusComposer(navigate, 'conv-1');
    // The intent is pending for exactly this conversation (a different id does not consume it).
    expect(consumeComposerFocus('other')).toBe(false);
    expect(consumeComposerFocus('conv-1')).toBe(true);
    expect(navigate).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'conv-1' },
    });
  });
});
