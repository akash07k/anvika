import { useState } from 'react';
import { Link } from '@tanstack/react-router';

import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { ConversationRowMenu } from './ConversationRowMenu';
import { DeleteConversationControl } from './DeleteConversationControl';
import { RenameConversationField } from './RenameConversationField';
import { CONVERSATIONS_HEADING_ID, nextSiblingRowId, sectionLinkPrefix } from './sectionRowFocus';
import { UNTITLED_CONVERSATION_LABEL } from './untitledLabel';
import { useBranchConversation } from './useBranchConversation';
import { usePinConversation } from './usePinConversation';
import { useRenameConversation } from './useRenameConversation';

/** Props for {@link ConversationListItem}. */
export interface ConversationListItemProps {
  /** The conversation summary this row links to. */
  summary: ConversationSummary;
  /**
   * The id of the section this row is rendered under. When provided, the row's DOM id is scoped to it
   * (`conversation-link-${sectionId}-${summary.id}`) so the same conversation repeated across sections
   * (Pinned, Recent, and its time bucket) keeps a unique, valid id and per-section focus return; when
   * omitted the id stays the unscoped `conversation-link-${summary.id}` (the flat-list default).
   */
  sectionId?: string;
  /**
   * Whether to mark this row as a pinned conversation shown OUTSIDE the Pinned section. When true the
   * link's accessible name gains a " (Pinned)" suffix so a screen reader announces that this row is a
   * repeat of a pinned conversation; false/omitted leaves the name as just the title.
   */
  showPinnedSuffix?: boolean;
}

/**
 * One conversation in the list: a TanStack {@link Link} to `/c/$conversationId` whose accessible name
 * is the conversation title (falling back to "Untitled conversation" for an empty title). The link is
 * the single tab stop AND the trigger for a {@link ContextMenu} (it opens on the `contextmenu` event
 * the Applications key / Shift+F10 / right-click dispatch - no separate menu button, so the row stays
 * one tab stop). The menu offers Pin/Unpin, Branch, Rename, and Delete for THIS conversation (the
 * first item toggles between "Pin" and "Unpin" depending on whether the conversation is currently
 * pinned; Branch forks the whole conversation into a new one).
 *
 * The row has three modes, owned here: the default link-with-menu; the inline rename
 * ({@link RenameConversationField}) chosen from the menu; and the delete confirmation
 * ({@link DeleteConversationControl}). Choosing Rename swaps the link for the field; saving or
 * cancelling returns to the link and restores focus to it. Choosing Delete opens the confirm dialog.
 *
 * In the sectioned nav the same conversation can repeat across sections, so two optional props keep
 * those repeats correct: `sectionId` scopes the link's DOM id (so duplicates stay unique and the
 * inline-rename focus return targets THIS section's copy), and `showPinnedSuffix` appends a
 * "(Pinned)" marker to the link name for a pinned conversation shown outside the Pinned section.
 *
 * @param props - See {@link ConversationListItemProps}.
 */
export function ConversationListItem({
  summary,
  sectionId,
  showPinnedSuffix,
}: ConversationListItemProps) {
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { rename } = useRenameConversation(summary.id);
  const { setPinned } = usePinConversation(summary.id);
  const { branch } = useBranchConversation(summary.id);

  // A single id shared by the link and its focus-return target. Scoping it to the section keeps the
  // same conversation's repeated rows unique (and focus returning to THIS section's copy).
  const linkId = sectionId
    ? `${sectionLinkPrefix(sectionId)}${summary.id}`
    : `conversation-link-${summary.id}`;
  const base = summary.title || UNTITLED_CONVERSATION_LABEL;
  const linkLabel = showPinnedSuffix ? `${base} (Pinned)` : base;

  /** Return focus to this row's link after the inline rename closes (Save or Cancel). */
  const focusLink = () => {
    setRenaming(false);
    // Defer so focus lands after the link re-renders in place of the rename field.
    requestAnimationFrame(() => document.getElementById(linkId)?.focus());
  };

  /**
   * Toggle this row's pinned state, keeping a screen-reader or keyboard user oriented afterwards. In any
   * section OTHER than Pinned the row stays put (pinning only adds or removes its " (Pinned)" suffix), so
   * focus stays on this same conversation's link. In the Pinned section, Unpin removes this row from the
   * section, so focus moves to the next pinned conversation (the previous one when this was last), or to
   * the list heading when no pinned conversation remains.
   *
   * The focus target is computed now (so the sibling lookup still sees this row), but the toggle is
   * deferred one frame: applying the optimistic update synchronously unmounts this row WHILE its context
   * menu is still mid-close, leaving Radix's focus machinery to strand focus on `<body>`. Waiting a frame
   * lets the menu finish closing and release its focus scope first; then the toggle unmounts the row and a
   * second frame later we place focus on the stable target. (Mirrors how the delete flow's menu closes
   * gracefully - by opening a dialog - before its row unmounts.)
   *
   * On a FAILED toggle `setPinned` rolls back, so the row reappears where it was; focus is then corrected
   * back to this row's link rather than left on the now-stale sibling/heading (a no-op when the target
   * already IS this row's link, i.e. a non-Pinned section).
   */
  const togglePinned = () => {
    const target =
      sectionId === 'pinned'
        ? (nextSiblingRowId(sectionLinkPrefix('pinned'), linkId) ?? CONVERSATIONS_HEADING_ID)
        : linkId;
    requestAnimationFrame(() => {
      const settled = setPinned(summary.pinnedAt === null);
      requestAnimationFrame(() => document.getElementById(target)?.focus());
      void settled.then((ok) => {
        if (!ok) requestAnimationFrame(() => document.getElementById(linkId)?.focus());
      });
    });
  };

  if (renaming) {
    return (
      <li>
        <RenameConversationField
          currentTitle={summary.title}
          onSubmit={(title) => {
            void rename(title);
            focusLink();
          }}
          onCancel={focusLink}
        />
      </li>
    );
  }

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            id={linkId}
            to="/c/$conversationId"
            params={{ conversationId: summary.id }}
            activeOptions={{ exact: true }}
            activeProps={{ 'aria-current': 'page' }}
            // `block` plus vertical padding gives the link a >=24px pointer target (WCAG 2.2 SC 2.5.8),
            // so the row is comfortably clickable as well as keyboard-reachable.
            className="block px-2 py-2"
          >
            {linkLabel}
          </Link>
        </ContextMenuTrigger>
        <ConversationRowMenu
          linkId={linkId}
          isPinned={summary.pinnedAt !== null}
          onTogglePin={togglePinned}
          onBranch={() => void branch()}
          onRename={() => setRenaming(true)}
          onDelete={() => setConfirmingDelete(true)}
        />
      </ContextMenu>
      <DeleteConversationControl
        id={summary.id}
        title={summary.title}
        sectionId={sectionId}
        linkId={linkId}
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    </li>
  );
}
