import { useState } from 'react';

import { useDialogTitleFocus } from '../../hooks/focus/useDialogTitleFocus';
import { useConversationList } from '../../lib/conversation/conversationQueries';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';

import { ManageConversationsList } from './ManageConversationsList';

/**
 * The Settings entry point for batch-managing conversations (5a.4): a "Manage conversations" button
 * that opens a modal {@link Dialog} holding the batch-delete list, rather than laying potentially
 * thousands of checkboxes inline in Settings (which would clutter the page). The button's accessible
 * name carries the conversation count ("Manage conversations, N total"), keeping its visible label as a
 * substring (WCAG 2.5.3 label-in-name).
 *
 * The dialog's focus trap, Escape-to-dismiss, and `dialog` role come from the primitive (ADR 0031);
 * {@link useDialogTitleFocus} focuses the title on open (so screen-reader users read the dialog
 * top-to-bottom) and restores focus to this button on close. The `tabIndex={-1}` title is also the
 * focus anchor the inner {@link ManageConversationsList} steers to after a batch delete (the row
 * controls have unmounted or disabled by then), so focus never falls to `<body>`.
 * `aria-describedby={undefined}` opts out of the Radix missing-description warning: the title alone
 * names the dialog.
 *
 * Search/filter over the list and virtualization for very large lists are a deliberate follow-up; this
 * dialog contains the Settings clutter today.
 *
 * @returns The Manage conversations button and its dialog.
 */
export function ManageConversationsDialog() {
  const { data } = useConversationList();
  const count = data?.conversations.length ?? 0;
  const [open, setOpen] = useState(false);
  const { titleRef, dialogProps } = useDialogTitleFocus();

  return (
    <>
      <button
        type="button"
        aria-label={`Manage conversations, ${count} total`}
        onClick={() => setOpen(true)}
      >
        Manage conversations
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined} {...dialogProps}>
          <DialogTitle ref={titleRef} tabIndex={-1}>
            Manage conversations
          </DialogTitle>
          <ManageConversationsList focusAnchorRef={titleRef} />
        </DialogContent>
      </Dialog>
    </>
  );
}
