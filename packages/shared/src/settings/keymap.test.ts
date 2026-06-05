import { describe, expect, it } from 'vitest';

import { KEYMAP_ACTION_LABELS } from './keymap-labels';
import { DEFAULT_KEYMAP, KEYMAP_ACTIONS, KeymapActionSchema, KeymapSchema } from './keymap';
import { CONVERSATION_QUICK_NAV_ACTIONS, PINNED_QUICK_NAV_ACTIONS } from './keymap-quick-nav';

describe('keymap', () => {
  it('defines all keymap actions including the open-shortcuts, reasoning, new-conversation, and edit-latest actions', () => {
    expect(KEYMAP_ACTIONS).toHaveLength(45);
    expect(KEYMAP_ACTIONS).toContain('send');
    expect(KEYMAP_ACTIONS).toContain('toggleSendKeyMode');
    expect(KEYMAP_ACTIONS).toContain('openKeyboardShortcuts');
    expect(KEYMAP_ACTIONS).toContain('quickNav0');
    expect(KEYMAP_ACTIONS).toContain('newConversation');
    expect(KEYMAP_ACTIONS).toContain('newConversationAdvanced');
    expect(KEYMAP_ACTIONS).toContain('editLatestUserMessage');
  });

  it('binds the send-key-mode toggle to Alt+Enter by default', () => {
    expect(DEFAULT_KEYMAP.toggleSendKeyMode).toBe('alt+enter');
  });

  it('binds open keyboard shortcuts to alt+slash by default', () => {
    // react-hotkeys-hook maps e.code through L() which strips key/digit/numpad and lowercases,
    // so the Slash key's code 'Slash' becomes the binding token 'slash'. Using 'alt+/' would
    // register the literal '/' string and never match the 'slash' token from L('Slash').
    expect(DEFAULT_KEYMAP.openKeyboardShortcuts).toBe('alt+slash');
  });

  it('the default keymap binds every action', () => {
    for (const action of KEYMAP_ACTIONS) {
      expect(DEFAULT_KEYMAP[action]).toBeTruthy();
    }
    expect(DEFAULT_KEYMAP.send).toBe('ctrl+enter, meta+enter');
    expect(DEFAULT_KEYMAP.stop).toBe('shift+escape');
  });

  it('backfills missing keys from defaults, keeps overrides, and rejects unknown keys (approach C)', () => {
    expect(KeymapSchema.parse(undefined)).toEqual(DEFAULT_KEYMAP); // absent -> full defaults
    const partial = KeymapSchema.parse({ send: 'alt+s' });
    expect(partial.send).toBe('alt+s'); // user override wins
    expect(partial.toggleSendKeyMode).toBe('alt+enter'); // missing key backfilled
    expect(Object.keys(partial)).toHaveLength(45); // complete after backfill
    expect(KeymapSchema.safeParse({ ...DEFAULT_KEYMAP, bogus: 'x' }).success).toBe(false); // unknown rejected
    expect(KeymapSchema.parse('garbage')).toEqual(DEFAULT_KEYMAP); // corrupt non-object recovers
  });

  describe('KEYMAP_ACTION_LABELS', () => {
    it('has a non-empty label for every action', () => {
      for (const action of KEYMAP_ACTIONS) {
        expect(KEYMAP_ACTION_LABELS[action]).toBeTruthy();
      }
    });

    it('labels the open-shortcuts action', () => {
      expect(KEYMAP_ACTION_LABELS.openKeyboardShortcuts).toBe('Open keyboard shortcuts');
    });
  });

  describe('openKeyboardShortcuts backfill regression', () => {
    it('backfills openKeyboardShortcuts on an older keymap with no migration', () => {
      const stored = { send: 'ctrl+enter, meta+enter', stop: 'shift+escape' };
      const resolved = KeymapSchema.parse(stored);
      expect(resolved.openKeyboardShortcuts).toBe('alt+slash');
      expect(resolved.send).toBe('ctrl+enter, meta+enter');
    });
  });

  describe('new-conversation shortcut', () => {
    it('binds newConversation to alt+n and labels it', () => {
      expect(DEFAULT_KEYMAP.newConversation).toBe('alt+n');
      expect(KEYMAP_ACTION_LABELS.newConversation).toBe('New conversation');
    });
    it('KeymapActionSchema accepts newConversation', () => {
      expect(KeymapActionSchema.parse('newConversation')).toBe('newConversation');
    });
    it('binds newConversationAdvanced to alt+shift+n and labels it', () => {
      expect(DEFAULT_KEYMAP.newConversationAdvanced).toBe('alt+shift+n');
      expect(KEYMAP_ACTION_LABELS.newConversationAdvanced).toBe('New conversation with options');
    });
    it('KeymapActionSchema accepts newConversationAdvanced', () => {
      expect(KeymapActionSchema.parse('newConversationAdvanced')).toBe('newConversationAdvanced');
    });
    it('backfills newConversationAdvanced on a keymap missing it with no migration (ADR 0018)', () => {
      const resolved = KeymapSchema.parse({ send: 'ctrl+enter, meta+enter', stop: 'shift+escape' });
      expect(resolved.newConversationAdvanced).toBe('alt+shift+n');
    });
  });

  describe('edit-latest-user-message shortcut', () => {
    it('binds editLatestUserMessage to ctrl+up and labels it', () => {
      expect(DEFAULT_KEYMAP.editLatestUserMessage).toBe('ctrl+up');
      expect(KEYMAP_ACTION_LABELS.editLatestUserMessage).toBe('Edit the most recent message');
    });
    it('KeymapActionSchema accepts editLatestUserMessage', () => {
      expect(KeymapActionSchema.parse('editLatestUserMessage')).toBe('editLatestUserMessage');
    });
    it('backfills editLatestUserMessage on a keymap missing it with no migration (ADR 0018)', () => {
      const stored = { send: 'ctrl+enter, meta+enter', stop: 'shift+escape' };
      const resolved = KeymapSchema.parse(stored);
      expect(resolved.editLatestUserMessage).toBe('ctrl+up');
      expect(resolved.send).toBe('ctrl+enter, meta+enter');
    });
  });

  describe('reasoning shortcuts', () => {
    it('includes toggleThinking and jumpToThinking with default bindings', () => {
      expect(DEFAULT_KEYMAP.toggleThinking).toBe('alt+t');
      expect(DEFAULT_KEYMAP.jumpToThinking).toBe('alt+r');
    });
    it('labels both reasoning actions', () => {
      expect(KEYMAP_ACTION_LABELS.toggleThinking).toBe('Toggle thinking');
      expect(KEYMAP_ACTION_LABELS.jumpToThinking).toBe('Jump to the latest thinking');
    });
    it('KeymapActionSchema accepts the new actions', () => {
      expect(KeymapActionSchema.parse('toggleThinking')).toBe('toggleThinking');
      expect(KeymapActionSchema.parse('jumpToThinking')).toBe('jumpToThinking');
    });
  });

  describe('conversation navigation shortcuts', () => {
    it('binds focusConversationList to alt+shift+c and labels it', () => {
      expect(DEFAULT_KEYMAP.focusConversationList).toBe('alt+shift+c');
      expect(KEYMAP_ACTION_LABELS.focusConversationList).toBe('Focus the conversation list');
    });

    it('binds the conversation quick-nav slots to alt+shift+1..0', () => {
      expect(DEFAULT_KEYMAP.conversationQuickNav1).toBe('alt+shift+1');
      expect(DEFAULT_KEYMAP.conversationQuickNav0).toBe('alt+shift+0');
    });

    it('labels the first and last conversation quick-nav slots', () => {
      expect(KEYMAP_ACTION_LABELS.conversationQuickNav1).toBe(
        'Switch to the most recent conversation',
      );
      expect(KEYMAP_ACTION_LABELS.conversationQuickNav0).toBe(
        'Switch to the 10th most recent conversation',
      );
    });

    it('KeymapActionSchema accepts the conversation navigation actions', () => {
      expect(KeymapActionSchema.parse('focusConversationList')).toBe('focusConversationList');
      expect(KeymapActionSchema.parse('conversationQuickNav1')).toBe('conversationQuickNav1');
    });

    it('CONVERSATION_QUICK_NAV_ACTIONS lists the ten slots in order', () => {
      expect(CONVERSATION_QUICK_NAV_ACTIONS).toHaveLength(10);
      expect(CONVERSATION_QUICK_NAV_ACTIONS[0]).toBe('conversationQuickNav1');
      expect(CONVERSATION_QUICK_NAV_ACTIONS[9]).toBe('conversationQuickNav0');
    });

    it('backfills the conversation actions on a keymap missing them with no migration (ADR 0018)', () => {
      const stored = { send: 'ctrl+enter, meta+enter', stop: 'shift+escape' };
      const resolved = KeymapSchema.parse(stored);
      expect(resolved.focusConversationList).toBe('alt+shift+c');
      expect(resolved.conversationQuickNav1).toBe('alt+shift+1');
    });
  });

  describe('pinned conversation navigation shortcuts', () => {
    it('binds the pinned quick-nav slots to ctrl+alt+1..0', () => {
      expect(DEFAULT_KEYMAP.pinnedQuickNav1).toBe('ctrl+alt+1');
      expect(DEFAULT_KEYMAP.pinnedQuickNav0).toBe('ctrl+alt+0');
    });

    it('binds focusPinnedConversationList to ctrl+alt+c and togglePinCurrentConversation to ctrl+alt+p', () => {
      expect(DEFAULT_KEYMAP.focusPinnedConversationList).toBe('ctrl+alt+c');
      expect(DEFAULT_KEYMAP.togglePinCurrentConversation).toBe('ctrl+alt+p');
    });

    it('labels the pinned quick-nav slots and the pin actions', () => {
      expect(KEYMAP_ACTION_LABELS.pinnedQuickNav1).toBe(
        'Switch to the most recent pinned conversation',
      );
      expect(KEYMAP_ACTION_LABELS.pinnedQuickNav0).toBe(
        'Switch to the 10th most recent pinned conversation',
      );
      expect(KEYMAP_ACTION_LABELS.focusPinnedConversationList).toBe(
        'Focus the pinned conversations',
      );
      expect(KEYMAP_ACTION_LABELS.togglePinCurrentConversation).toBe(
        'Pin or unpin the current conversation',
      );
    });

    it('KeymapActionSchema accepts the pinned navigation actions', () => {
      expect(KeymapActionSchema.parse('pinnedQuickNav1')).toBe('pinnedQuickNav1');
      expect(KeymapActionSchema.parse('focusPinnedConversationList')).toBe(
        'focusPinnedConversationList',
      );
      expect(KeymapActionSchema.parse('togglePinCurrentConversation')).toBe(
        'togglePinCurrentConversation',
      );
    });

    it('PINNED_QUICK_NAV_ACTIONS lists the ten slots in order', () => {
      expect(PINNED_QUICK_NAV_ACTIONS).toHaveLength(10);
      expect(PINNED_QUICK_NAV_ACTIONS[0]).toBe('pinnedQuickNav1');
      expect(PINNED_QUICK_NAV_ACTIONS[9]).toBe('pinnedQuickNav0');
    });

    it('backfills the pinned actions on a keymap missing them with no migration (ADR 0018)', () => {
      const resolved = KeymapSchema.parse({ send: 'ctrl+enter, meta+enter' });
      expect(resolved.pinnedQuickNav1).toBe('ctrl+alt+1');
    });
  });
});
