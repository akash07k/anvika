import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { createMenuAccessKeyHandler, type MenuAccessKeyMap } from '../conversations/menuAccessKeys';

/** Props for {@link MessageActionsMenu}. */
export interface MessageActionsMenuProps {
  /** Stable DOM-id base for this message+index (e.g. the messageDomId); item ids derive from it. */
  idBase: string;
  /** Accessible trigger name, role-aware, supplied by the parent (e.g. "Actions for your message"). */
  triggerLabel: string;
  /** The message's role, used to role-filter which items appear. */
  messageRole: 'user' | 'assistant';
  /** Disable every item while a turn is generating. */
  isStreaming: boolean;
  /** Branch the conversation through this message; omitted when unavailable (draft). Any role. */
  onBranch?: (() => void) | undefined;
  /** Edit this message (user messages only); omitted when unavailable. */
  onEdit?: (() => void) | undefined;
  /** Regenerate from this message (assistant messages only); omitted when unavailable. */
  onRegenerate?: (() => void) | undefined;
}

/**
 * A per-message "Message actions" dropdown menu, presentational (no data hooks inside). It carries a
 * role-filtered set of items: Edit (user messages, when `onEdit` is given), Regenerate (assistant
 * messages, when `onRegenerate` is given), and Branch (any role, when `onBranch` is given). The
 * role-specific action is listed first, then Branch, so a user row reads "Edit message, Branch from
 * here" and an assistant row reads "Regenerate response, Branch from here".
 *
 * When NO item applies (e.g. a draft with `onBranch` undefined and no edit/regenerate) the WHOLE
 * menu - trigger included - renders nothing, so a draft never shows an empty menu and only the
 * sibling Copy button remains. Otherwise the trigger is a real `<button>` named `triggerLabel`, and
 * each item carries an in-menu single-letter accelerator (`e` Edit, `g` Regenerate, `b` Branch):
 * the item exposes `aria-keyshortcuts` for screen readers and shows the letter via an `aria-hidden`
 * {@link DropdownMenuShortcut}, so its accessible name stays the bare label. The content's
 * `onKeyDown` (from {@link createMenuAccessKeyHandler}) activates an item when its bare letter is
 * pressed while the menu is open; Ctrl/Meta/Alt combinations are ignored so the accelerator never
 * shadows a browser or assistive-technology shortcut. Role-filtering keeps Edit and Regenerate
 * mutually exclusive, so the `e`/`g`/`b` letters never collide. Every item is disabled while
 * `isStreaming`. Content-safe: ids and labels only; no message text is read or logged.
 *
 * @param props - See {@link MessageActionsMenuProps}.
 * @returns The message actions menu, or `null` when no item is available.
 */
export function MessageActionsMenu({
  idBase,
  triggerLabel,
  messageRole,
  isStreaming,
  onBranch,
  onEdit,
  onRegenerate,
}: MessageActionsMenuProps) {
  const showEdit = messageRole === 'user' && onEdit !== undefined;
  const showRegenerate = messageRole === 'assistant' && onRegenerate !== undefined;
  const showBranch = onBranch !== undefined;

  // No available items: render nothing so a draft never shows an empty menu (Copy stays on its own).
  if (!showEdit && !showRegenerate && !showBranch) return null;

  const editItemId = `${idBase}-action-edit`;
  const regenItemId = `${idBase}-action-regenerate`;
  const branchItemId = `${idBase}-action-branch`;
  const accessKeys: MenuAccessKeyMap = {
    ...(showEdit ? { e: editItemId } : {}),
    ...(showRegenerate ? { g: regenItemId } : {}),
    ...(showBranch ? { b: branchItemId } : {}),
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button">{triggerLabel}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onKeyDown={createMenuAccessKeyHandler(accessKeys)}>
        {showEdit ? (
          <DropdownMenuItem
            id={editItemId}
            aria-keyshortcuts="E"
            disabled={isStreaming}
            onSelect={() => onEdit?.()}
          >
            Edit message
            <DropdownMenuShortcut aria-hidden="true">E</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
        {showRegenerate ? (
          <DropdownMenuItem
            id={regenItemId}
            aria-keyshortcuts="G"
            disabled={isStreaming}
            onSelect={() => onRegenerate?.()}
          >
            Regenerate response
            <DropdownMenuShortcut aria-hidden="true">G</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
        {showBranch ? (
          <DropdownMenuItem
            id={branchItemId}
            aria-keyshortcuts="B"
            disabled={isStreaming}
            onSelect={() => onBranch?.()}
          >
            Branch from here
            <DropdownMenuShortcut aria-hidden="true">B</DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
