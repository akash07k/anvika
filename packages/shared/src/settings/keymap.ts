import { z } from 'zod';

/**
 * The fixed set of rebindable keyboard actions. `quickNav1`..
 * `quickNav0` address the last ten messages (Alt+1 most recent .. Alt+0 tenth). The rebinding UI
 * is deferred to a later release; these are the server-set defaults.
 *
 * Reasoning actions: `toggleThinking` (Alt+T) flips the per-conversation thinking effort on/off;
 * `jumpToThinking` (Alt+R) focuses the latest assistant message's Thinking disclosure. Both avoid
 * the existing Alt+A/Alt+U/Alt+C/Alt+Enter/Shift+Escape/Alt+1..0/Alt+slash bindings.
 *
 * Conversation actions: `newConversation` (Alt+N) creates a fresh conversation draft and
 * focuses the composer; `newConversationAdvanced` (Alt+Shift+N) opens the advanced
 * new-conversation dialog (optional title + model); `focusConversationList` (Alt+Shift+C) moves
 * focus to the conversation list;
 * `conversationQuickNav1`..`conversationQuickNav0` (Alt+Shift+1..0) switch to the last ten
 * conversations (slot 1 most recent .. slot 10 tenth). Alt+Shift+1..0 may collide with the Windows
 * language-switch shortcut - a caveat tracked for the manual screen-reader pass.
 *
 * Pinned-conversation navigation family: `pinnedQuickNav1`..`pinnedQuickNav0`
 * (Ctrl+Alt+1..0) switch to the last ten PINNED conversations (slot 1 most recent .. slot 10 tenth);
 * `focusPinnedConversationList` (Ctrl+Alt+C) focuses the pinned conversations;
 * `togglePinCurrentConversation` (Ctrl+Alt+P) pins or unpins the current conversation. On Windows
 * Ctrl+Alt behaves as AltGr, so on some keyboard layouts these may compose characters or clash with
 * graphics-driver hotkeys - a caveat tracked for the manual screen-reader pass.
 *
 * Edit action: `editLatestUserMessage` (Ctrl+Up) opens the inline editor for the most recent user
 * message and moves focus into it; it avoids every binding above.
 */
export const KEYMAP_ACTIONS = [
  'send',
  'stop',
  'jumpToLatestResponse',
  'jumpToLatestUser',
  'jumpToComposer',
  'toggleSendKeyMode',
  'quickNav1',
  'quickNav2',
  'quickNav3',
  'quickNav4',
  'quickNav5',
  'quickNav6',
  'quickNav7',
  'quickNav8',
  'quickNav9',
  'quickNav0',
  'openKeyboardShortcuts',
  'toggleThinking',
  'jumpToThinking',
  'newConversation',
  'newConversationAdvanced',
  'editLatestUserMessage',
  'focusConversationList',
  'conversationQuickNav1',
  'conversationQuickNav2',
  'conversationQuickNav3',
  'conversationQuickNav4',
  'conversationQuickNav5',
  'conversationQuickNav6',
  'conversationQuickNav7',
  'conversationQuickNav8',
  'conversationQuickNav9',
  'conversationQuickNav0',
  'pinnedQuickNav1',
  'pinnedQuickNav2',
  'pinnedQuickNav3',
  'pinnedQuickNav4',
  'pinnedQuickNav5',
  'pinnedQuickNav6',
  'pinnedQuickNav7',
  'pinnedQuickNav8',
  'pinnedQuickNav9',
  'pinnedQuickNav0',
  'focusPinnedConversationList',
  'togglePinCurrentConversation',
] as const;

/** Zod schema for a valid keymap action name. */
export const KeymapActionSchema = z.enum(KEYMAP_ACTIONS);

/** A rebindable keyboard action name. */
export type KeymapAction = z.infer<typeof KeymapActionSchema>;

/**
 * The built-in default key bindings, stored in react-hotkeys-hook's exact syntax
 * (the keyboard layer hands them straight to `useHotkeys`). Modifier-based or rebindable throughout,
 * per the character-key-shortcuts accessibility guidance. `send` lists both `ctrl+enter` and
 * `meta+enter` (react-hotkeys-hook has no `mod` token; it listens to a comma-separated list), matching
 * the default `sendKeyMode: modEnter`. The `escape` token (in `stop`) was verified against
 * react-hotkeys-hook 5.3.2 in a real browser (the key smoke test); both `esc` and `escape`
 * are valid aliases.
 */
export const DEFAULT_KEYMAP: Record<KeymapAction, string> = {
  send: 'ctrl+enter, meta+enter',
  stop: 'shift+escape',
  jumpToLatestResponse: 'alt+a',
  jumpToLatestUser: 'alt+u',
  jumpToComposer: 'alt+c',
  toggleSendKeyMode: 'alt+enter',
  quickNav1: 'alt+1',
  quickNav2: 'alt+2',
  quickNav3: 'alt+3',
  quickNav4: 'alt+4',
  quickNav5: 'alt+5',
  quickNav6: 'alt+6',
  quickNav7: 'alt+7',
  quickNav8: 'alt+8',
  quickNav9: 'alt+9',
  quickNav0: 'alt+0',
  openKeyboardShortcuts: 'alt+slash',
  toggleThinking: 'alt+t',
  jumpToThinking: 'alt+r',
  newConversation: 'alt+n',
  newConversationAdvanced: 'alt+shift+n',
  editLatestUserMessage: 'ctrl+up',
  focusConversationList: 'alt+shift+c',
  conversationQuickNav1: 'alt+shift+1',
  conversationQuickNav2: 'alt+shift+2',
  conversationQuickNav3: 'alt+shift+3',
  conversationQuickNav4: 'alt+shift+4',
  conversationQuickNav5: 'alt+shift+5',
  conversationQuickNav6: 'alt+shift+6',
  conversationQuickNav7: 'alt+shift+7',
  conversationQuickNav8: 'alt+shift+8',
  conversationQuickNav9: 'alt+shift+9',
  conversationQuickNav0: 'alt+shift+0',
  pinnedQuickNav1: 'ctrl+alt+1',
  pinnedQuickNav2: 'ctrl+alt+2',
  pinnedQuickNav3: 'ctrl+alt+3',
  pinnedQuickNav4: 'ctrl+alt+4',
  pinnedQuickNav5: 'ctrl+alt+5',
  pinnedQuickNav6: 'ctrl+alt+6',
  pinnedQuickNav7: 'ctrl+alt+7',
  pinnedQuickNav8: 'ctrl+alt+8',
  pinnedQuickNav9: 'ctrl+alt+9',
  pinnedQuickNav0: 'ctrl+alt+0',
  focusPinnedConversationList: 'ctrl+alt+c',
  togglePinCurrentConversation: 'ctrl+alt+p',
};

/**
 * The keymap: an exhaustive record from every {@link KeymapAction} to its binding string. The
 * stored value MAY be partial or absent (or even non-object): a `z.preprocess` step backfills any
 * missing key from {@link DEFAULT_KEYMAP} before validation, so a new action is additive and needs
 * no migration (ADR 0018). After backfill the record is exhaustive, so the validated value always
 * holds every action; a user override still wins, and an unknown key is still rejected. PATCH merges
 * per-action. Binding strings are not validated against react-hotkeys-hook grammar
 * yet (no rebinding UI yet).
 */
export const KeymapSchema = z
  .preprocess(
    (value) => ({ ...DEFAULT_KEYMAP, ...(value && typeof value === 'object' ? value : {}) }),
    z.record(KeymapActionSchema, z.string()),
  )
  .meta({ label: 'Keyboard shortcuts', description: 'Action-to-binding map.', category: 'keymap' });
