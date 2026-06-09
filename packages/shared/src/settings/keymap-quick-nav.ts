import { type KeymapAction } from './keymap';

/**
 * The quick-nav slot-list constants, in slot order (slot 1 most recent .. slot 10 tenth). Each is the
 * single source of its list, shared by the chat/conversation hotkeys (one `useHotkeys` per slot - a
 * constant ten iterations, hence the `as const` fixed length) and the shortcuts cheatsheet (which
 * collapses the ten into one listing row). `satisfies` validates each entry is a real
 * {@link KeymapAction}. Kept in their own module so {@link KeymapAction}'s module stays under the ADR
 * 0007 line cap and focused on the action set, defaults, and schema.
 */

/**
 * The message quick-nav actions in slot order: slot 1 (most recent) through slot 10 (`quickNav0`).
 */
export const QUICK_NAV_ACTIONS = [
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
] as const satisfies readonly KeymapAction[];

/**
 * The conversation quick-nav actions in slot order: slot 1 (most recent) through slot 10
 * (`conversationQuickNav0`).
 */
export const CONVERSATION_QUICK_NAV_ACTIONS = [
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
] as const satisfies readonly KeymapAction[];

/**
 * The pinned-conversation quick-nav actions in slot order: slot 1 (most recent pinned) through slot 10
 * (`pinnedQuickNav0`).
 */
export const PINNED_QUICK_NAV_ACTIONS = [
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
] as const satisfies readonly KeymapAction[];
