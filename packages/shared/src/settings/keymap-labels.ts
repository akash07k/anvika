import { type KeymapAction } from './keymap';

/**
 * The human label for each {@link KeymapAction}, the single source of truth for the shortcuts
 * cheatsheet. A `Record<KeymapAction, string>` forces a label for every action, so the
 * compiler rejects an unlabeled action even though the rendered listing collapses the ten quick-nav
 * actions into one row. Plain ASCII for screen-reader cleanliness. Kept in its own module so the
 * binding contract in {@link KeymapAction}'s module stays focused on the bindings, not their display.
 */
export const KEYMAP_ACTION_LABELS: Record<KeymapAction, string> = {
  send: 'Send message',
  stop: 'Stop generating',
  jumpToLatestResponse: 'Jump to the latest response',
  jumpToLatestUser: 'Jump to the latest user message',
  jumpToComposer: 'Jump to the composer',
  toggleSendKeyMode: 'Toggle the send-key mode',
  quickNav1: 'Read the most recent message',
  quickNav2: 'Read the 2nd most recent message',
  quickNav3: 'Read the 3rd most recent message',
  quickNav4: 'Read the 4th most recent message',
  quickNav5: 'Read the 5th most recent message',
  quickNav6: 'Read the 6th most recent message',
  quickNav7: 'Read the 7th most recent message',
  quickNav8: 'Read the 8th most recent message',
  quickNav9: 'Read the 9th most recent message',
  quickNav0: 'Read the 10th most recent message',
  openKeyboardShortcuts: 'Open keyboard shortcuts',
  toggleThinking: 'Toggle thinking',
  jumpToThinking: 'Jump to the latest thinking',
  newConversation: 'New conversation',
  newConversationAdvanced: 'New conversation with options',
  editLatestUserMessage: 'Edit the most recent message',
  focusConversationList: 'Focus the conversation list',
  conversationQuickNav1: 'Switch to the most recent conversation',
  conversationQuickNav2: 'Switch to the 2nd most recent conversation',
  conversationQuickNav3: 'Switch to the 3rd most recent conversation',
  conversationQuickNav4: 'Switch to the 4th most recent conversation',
  conversationQuickNav5: 'Switch to the 5th most recent conversation',
  conversationQuickNav6: 'Switch to the 6th most recent conversation',
  conversationQuickNav7: 'Switch to the 7th most recent conversation',
  conversationQuickNav8: 'Switch to the 8th most recent conversation',
  conversationQuickNav9: 'Switch to the 9th most recent conversation',
  conversationQuickNav0: 'Switch to the 10th most recent conversation',
  pinnedQuickNav1: 'Switch to the most recent pinned conversation',
  pinnedQuickNav2: 'Switch to the 2nd most recent pinned conversation',
  pinnedQuickNav3: 'Switch to the 3rd most recent pinned conversation',
  pinnedQuickNav4: 'Switch to the 4th most recent pinned conversation',
  pinnedQuickNav5: 'Switch to the 5th most recent pinned conversation',
  pinnedQuickNav6: 'Switch to the 6th most recent pinned conversation',
  pinnedQuickNav7: 'Switch to the 7th most recent pinned conversation',
  pinnedQuickNav8: 'Switch to the 8th most recent pinned conversation',
  pinnedQuickNav9: 'Switch to the 9th most recent pinned conversation',
  pinnedQuickNav0: 'Switch to the 10th most recent pinned conversation',
  focusPinnedConversationList: 'Focus the pinned conversations',
  togglePinCurrentConversation: 'Pin or unpin the current conversation',
};
