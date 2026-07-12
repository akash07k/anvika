import { useState, type RefObject } from 'react';

import { useConversationList } from '../../lib/conversation/conversationQueries';
import { ConfirmDialog } from '../ConfirmDialog';

import { ConversationCheckbox } from './ConversationCheckbox';
import { useBatchDeleteConversations } from './useBatchDeleteConversations';

/** Props for {@link ManageConversationsList}. */
export interface ManageConversationsListProps {
  /**
   * The element to focus after a confirmed delete - the enclosing dialog's title. After a batch delete
   * the "Delete selected" button is either disabled (the selection cleared) or unmounted (the list
   * emptied), so focus is steered to this stable anchor rather than allowed to fall to `<body>`.
   */
  focusAnchorRef: RefObject<HTMLElement | null>;
}

/**
 * The batch-delete body of the Manage conversations dialog (5a.4): the conversation list as a group of
 * labeled checkboxes (each named for its title, content-safe in the UI), a "Select all" toggle, and a
 * "Delete selected" button disabled until something is selected.
 *
 * Activating "Delete selected" opens a destructive {@link ConfirmDialog} naming the count; confirming
 * runs {@link useBatchDeleteConversations}, which deletes, invalidates the list, and announces the
 * content-safe `conversationsBatchDeleted` count (or `conversationsBatchDeleteFailed` on failure).
 * Selection is cleared only on a SUCCESSFUL delete - a failed batch keeps it so the user can retry -
 * and any since-gone ids drop out naturally because selection is intersected with the live ids before
 * submit. After a confirmed delete, focus is steered to `focusAnchorRef` (the dialog title), mirroring
 * the row-delete focus return in `useDeleteConversation`. No navigation is needed: the server recomputes
 * the active id and the refreshed list reflects it.
 *
 * @param props - See {@link ManageConversationsListProps}.
 * @returns The manage-conversations batch-delete body.
 */
export function ManageConversationsList({ focusAnchorRef }: ManageConversationsListProps) {
  const { data } = useConversationList();
  const conversations = data?.conversations ?? [];
  const { removeMany } = useBatchDeleteConversations();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  /** Toggle one conversation's selection by id. */
  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // Select-all reflects only the live ids, so a stale selection never reports "all selected".
  const allSelected = conversations.length > 0 && conversations.every((c) => selected.has(c.id));

  /** Select every conversation, or clear the selection when all are already selected. */
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(conversations.map((c) => c.id)));
  };

  // Submit only ids still present in the live list, so a since-deleted id is never re-sent.
  const liveSelectedIds = conversations.filter((c) => selected.has(c.id)).map((c) => c.id);

  /** Delete the selected conversations, close the dialog, anchor focus, and clear selection on success. */
  const onConfirm = () => {
    setConfirming(false);
    requestAnimationFrame(() => focusAnchorRef.current?.focus());
    void removeMany(liveSelectedIds).then((deleted) => {
      if (deleted) setSelected(new Set());
    });
  };

  if (conversations.length === 0) {
    return <p>No conversations to manage.</p>;
  }

  return (
    <div>
      <button type="button" onClick={toggleAll}>
        {allSelected ? 'Deselect all' : 'Select all'}
      </button>
      <ul className="list-none pl-0">
        {conversations.map((summary) => (
          <ConversationCheckbox
            key={summary.id}
            id={summary.id}
            title={summary.title}
            checked={selected.has(summary.id)}
            onToggle={toggle}
          />
        ))}
      </ul>
      <button
        type="button"
        disabled={liveSelectedIds.length === 0}
        onClick={() => setConfirming(true)}
      >
        Delete selected
      </button>
      <ConfirmDialog
        open={confirming}
        title="Delete conversations?"
        description={`Delete ${liveSelectedIds.length} ${
          liveSelectedIds.length === 1 ? 'conversation' : 'conversations'
        }? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
