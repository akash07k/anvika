import { describe, expect, it, vi } from 'vitest';

vi.mock('../announce', () => ({ announce: vi.fn() }));

import { messageForEvent } from './speech';

describe('messageForEvent (pinned-conversation shortcuts)', () => {
  it('announces a pinned quick-nav switch high-priority, naming only the slot ordinal (content-safe)', () => {
    expect(messageForEvent({ type: 'pinnedConversationSwitched', slot: 1 })).toEqual({
      message: 'Switched to the most recent pinned conversation',
      priority: 'high',
    });
    // Slot 10 pins the `slot - 1` index math against an off-by-one (the last SLOT_ORDINALS entry).
    expect(messageForEvent({ type: 'pinnedConversationSwitched', slot: 10 })).toEqual({
      message: 'Switched to the 10th most recent pinned conversation',
      priority: 'high',
    });
  });

  it('announces an empty pinned quick-nav slot at normal priority and content-safely', () => {
    expect(messageForEvent({ type: 'pinnedQuickNavEmpty' })).toEqual({
      message: 'No pinned conversation in that slot',
      priority: 'normal',
    });
  });

  it('announces the no-pinned-conversations no-op at normal priority and content-safely', () => {
    expect(messageForEvent({ type: 'noPinnedConversations' })).toEqual({
      message: 'No pinned conversations',
      priority: 'normal',
    });
  });

  it('announces the cannot-pin-empty guard high-priority and content-safely', () => {
    expect(messageForEvent({ type: 'cannotPinEmptyConversation' })).toEqual({
      message: 'Cannot pin an empty conversation',
      priority: 'high',
    });
  });

  it('announces the conversation-list-loading guard high-priority and content-safely', () => {
    expect(messageForEvent({ type: 'conversationListLoading' })).toEqual({
      message: 'The conversation list is still loading. Please try again.',
      priority: 'high',
    });
  });
});
