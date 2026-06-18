import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';

import { createMenuAccessKeyHandler, type MenuAccessKeyMap } from './menuAccessKeys';

/** Props for {@link ConversationRowMenu}. */
export interface ConversationRowMenuProps {
  /**
   * The row's link DOM id. Each menu item's id derives from it (`${linkId}-menu-${action}`) so the same
   * conversation repeated across sections keeps unique item ids and the accelerators target the right
   * row's menu.
   */
  linkId: string;
  /** Whether the conversation is currently pinned: drives the Pin/Unpin label and its `p`/`u` accelerator. */
  isPinned: boolean;
  /** Toggle this conversation's pinned state. */
  onTogglePin: () => void;
  /** Branch the whole conversation into a new one. */
  onBranch: () => void;
  /** Enter the inline rename mode. */
  onRename: () => void;
  /** Open the delete confirmation. */
  onDelete: () => void;
}

/**
 * The conversation row's context-menu content: Pin/Unpin, Branch, Rename, and Delete, each with an
 * in-menu single-letter accelerator. Every item carries `aria-keyshortcuts` (the uppercase letter) for
 * screen readers and shows the letter visually via an `aria-hidden` {@link ContextMenuShortcut}, so the
 * accessible name stays the bare label. The content's `onKeyDown` (built by {@link createMenuAccessKeyHandler})
 * activates an item when its bare letter is pressed while the menu is open; Ctrl/Meta/Alt combinations
 * are ignored so the accelerators never shadow a browser or assistive-technology shortcut.
 *
 * @param props - See {@link ConversationRowMenuProps}.
 * @returns The context-menu content for one conversation row.
 */
export function ConversationRowMenu({
  linkId,
  isPinned,
  onTogglePin,
  onBranch,
  onRename,
  onDelete,
}: ConversationRowMenuProps) {
  const menuItemId = (action: string) => `${linkId}-menu-${action}`;
  // The pin accelerator follows the label: `p` to Pin an unpinned row, `u` to Unpin a pinned one.
  const pinLetter = isPinned ? 'u' : 'p';
  const accessKeys: MenuAccessKeyMap = {
    [pinLetter]: menuItemId('pin'),
    b: menuItemId('branch'),
    r: menuItemId('rename'),
    d: menuItemId('delete'),
  };
  return (
    <ContextMenuContent onKeyDown={createMenuAccessKeyHandler(accessKeys)}>
      <ContextMenuItem
        id={menuItemId('pin')}
        aria-keyshortcuts={pinLetter.toUpperCase()}
        onSelect={onTogglePin}
      >
        {isPinned ? 'Unpin' : 'Pin'}
        <ContextMenuShortcut aria-hidden="true">{pinLetter.toUpperCase()}</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem id={menuItemId('branch')} aria-keyshortcuts="B" onSelect={onBranch}>
        Branch
        <ContextMenuShortcut aria-hidden="true">B</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem id={menuItemId('rename')} aria-keyshortcuts="R" onSelect={onRename}>
        Rename
        <ContextMenuShortcut aria-hidden="true">R</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem
        id={menuItemId('delete')}
        aria-keyshortcuts="D"
        variant="destructive"
        onSelect={onDelete}
      >
        Delete
        <ContextMenuShortcut aria-hidden="true">D</ContextMenuShortcut>
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
