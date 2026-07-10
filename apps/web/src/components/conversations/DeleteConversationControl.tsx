import { ConfirmDialog } from '../ConfirmDialog';
import { UNTITLED_CONVERSATION_LABEL } from './untitledLabel';
import { useDeleteConversation } from './useDeleteConversation';

/** Props for {@link DeleteConversationControl}. */
export interface DeleteConversationControlProps {
  /** The conversation id to delete. */
  id: string;
  /** The conversation title, shown (never logged) in the dialog so the user knows what they delete. */
  title: string;
  /**
   * The accordion section this row is rendered under, if any. When set, a successful delete moves focus
   * to the next row in this section (or the list heading when none remains) instead of the New
   * conversation button; see {@link useDeleteConversation}.
   */
  sectionId?: string | undefined;
  /** The DOM id of this row's link, the focus return target when the delete fails (the row survives). */
  linkId: string;
  /** Whether the confirm dialog is open. The parent (the row) owns this state. */
  open: boolean;
  /** Close the dialog (Cancel or after a confirmed delete). */
  onClose: () => void;
}

/**
 * The destructive delete confirmation for one conversation (5a.3): a {@link ConfirmDialog} (destructive,
 * Cancel default-focused) named for the conversation. Confirming runs the delete via
 * {@link useDeleteConversation} (invalidate, announce, navigate-if-viewing), then closes. The title is
 * shown in the description so the user knows what they are deleting - content-safe in the UI, but it is
 * NEVER passed to the log channel (the `conversationDeleted` event is payload-less).
 *
 * Focus after a confirmed delete is anchored explicitly, not left to the dialog's opener restore: on
 * success the deleted row and its context-menu trigger unmount, so there is no opener link to restore
 * to. {@link useDeleteConversation} therefore moves focus (deferred a frame via `requestAnimationFrame`)
 * to the next row in this row's section, or the list heading when the section is now empty, so focus
 * never falls to `<body>`; a row with no section falls back to the New conversation button. On FAILURE
 * the row survives, so focus returns to it (`linkId`). For the one case where the deleted conversation
 * was the one on screen, the route navigates and the new surface's `h1` route focus (fired ~50ms later)
 * lands last and wins.
 *
 * @param props - See {@link DeleteConversationControlProps}.
 * @returns The delete confirmation dialog.
 */
export function DeleteConversationControl({
  id,
  title,
  sectionId,
  linkId,
  open,
  onClose,
}: DeleteConversationControlProps) {
  const { remove } = useDeleteConversation(id, { sectionId, linkId });
  const name = title || UNTITLED_CONVERSATION_LABEL;

  const onConfirm = () => {
    void remove();
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title="Delete conversation?"
      description={`Delete "${name}"? This permanently removes the conversation and its messages.`}
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}
