import { KEYMAP_ACTION_LABELS } from '@anvika/shared/settings/keymap-labels';
import { KEYMAP_ACTIONS, type KeymapAction } from '@anvika/shared/settings/keymap';
import {
  CONVERSATION_QUICK_NAV_ACTIONS,
  PINNED_QUICK_NAV_ACTIONS,
  QUICK_NAV_ACTIONS,
} from '@anvika/shared/settings/keymap-quick-nav';

import { formatBinding } from '../lib/keyboard/keyboardHelpers';
import { useIsMac } from '../hooks/settings/useIsMac';
import { useKeymap } from '../hooks/shortcuts/useKeymap';

/** A rendered shortcut row: a human action label and its humanized binding. */
interface ShortcutRow {
  /** Stable key for React. */
  id: string;
  /** The human action label. */
  label: string;
  /** The humanized, platform-aware binding text. */
  binding: string;
}

/**
 * The quick-nav actions (shared with the chat and conversation hotkeys), as a Set for the collapse
 * membership test. Collapses the message, conversation, AND pinned-conversation quick-nav families.
 */
const COLLAPSED_QUICK_NAV = new Set<KeymapAction>([
  ...QUICK_NAV_ACTIONS,
  ...CONVERSATION_QUICK_NAV_ACTIONS,
  ...PINNED_QUICK_NAV_ACTIONS,
]);

/**
 * Build the listing rows from the resolved keymap: every non-quick-nav action in `KEYMAP_ACTIONS`
 * order, plus one collapsed row each for the message, conversation, and pinned-conversation quick-nav
 * families. Pure over its inputs so it is trivially testable.
 *
 * @param keymap - The resolved action-to-binding record (always exhaustive: spreads DEFAULT_KEYMAP).
 * @param isMac - Whether to show the Cmd chord (Mac) or the Ctrl chord (elsewhere).
 * @returns The ordered rows to render.
 */
export function buildShortcutRows(
  keymap: Record<KeymapAction, string>,
  isMac: boolean,
): ShortcutRow[] {
  const rows: ShortcutRow[] = [];
  for (const action of KEYMAP_ACTIONS) {
    if (COLLAPSED_QUICK_NAV.has(action)) continue;
    rows.push({
      id: action,
      label: KEYMAP_ACTION_LABELS[action],
      binding: formatBinding(keymap[action], isMac),
    });
  }
  rows.push({
    id: 'quickNav',
    label: 'Read a recent message',
    binding: 'Alt+1 (most recent) through Alt+0 (tenth most recent)',
  });
  rows.push({
    id: 'conversationQuickNav',
    label: 'Switch to a recent conversation',
    binding: 'Alt+Shift+1 (most recent) through Alt+Shift+0 (tenth most recent)',
  });
  rows.push({
    id: 'pinnedQuickNav',
    label: 'Switch to a recent pinned conversation',
    binding: 'Ctrl+Alt+1 (most recent) through Ctrl+Alt+0 (tenth most recent)',
  });
  return rows;
}

/**
 * The canonical, read-only keyboard-shortcuts listing, reused by both the dialog and the
 * `/shortcuts` route. Reads the resolved keymap from {@link useKeymap}, humanizes each binding
 * (platform-aware via {@link useIsMac}), and renders a bulleted unordered list where each item reads
 * "Action: Key" (e.g. "Send message: Ctrl+Enter"), which a screen reader announces as one linear line.
 * The ten message quick-nav actions collapse into one item, the ten conversation quick-nav actions
 * collapse into their own single item, and the ten pinned-conversation quick-nav actions collapse into
 * a third single item. No inputs -- rebinding is deferred. The `openKeyboardShortcuts` action appears
 * in the listing so the shortcut is self-documenting.
 *
 * The list renders NO heading of its own: each surface provides the single heading (the dialog's title
 * `<h2>`, the page `<h1>`), so a screen reader never announces the title twice.
 *
 * @returns The shortcuts listing.
 */
export function KeyboardShortcuts() {
  const keymap = useKeymap();
  const isMac = useIsMac();
  const rows = buildShortcutRows(keymap, isMac);
  return (
    <ul className="list-disc pl-6">
      {rows.map((row) => (
        <li key={row.id}>
          {row.label}: {row.binding}
        </li>
      ))}
    </ul>
  );
}
