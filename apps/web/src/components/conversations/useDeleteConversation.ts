import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';

import {
  conversationListQuery,
  invalidateConversation,
} from '../../lib/conversation/conversationQueries';
import { deleteConversation } from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { notify } from '../../notifications/notifier';
import { useDraftStore } from '../../stores/draftStore';

import { NEW_CONVERSATION_BUTTON_ID } from './NewConversationButton';
import { CONVERSATIONS_HEADING_ID, nextSiblingRowId, sectionLinkPrefix } from './sectionRowFocus';

/** Where the delete row sits, so the hook can move focus sensibly once the row leaves the list. */
export interface DeleteConversationFocus {
  /** The accordion section the row is rendered under, if any (absent for a flat, unsectioned list). */
  sectionId?: string | undefined;
  /** The DOM id of the row's link: the focus target when the delete FAILS and the row survives. */
  linkId: string;
}

/** The delete action for a single conversation row (after the confirm dialog is accepted). */
export interface DeleteConversationAction {
  /**
   * Delete the conversation, invalidate the list, and announce `conversationDeleted`. When the deleted
   * conversation is the one currently being viewed, navigate to the server's resulting `activeId`, or -
   * when no conversations remain - mint a fresh draft and navigate there so the surface is never blank.
   * On failure nothing is removed, `conversationDeleteFailed` is announced, and no navigation happens;
   * either way focus is anchored so it never falls to `<body>`. Never rejects.
   */
  remove: () => Promise<void>;
}

/**
 * Provide the delete action for one conversation. Neither the id nor the title crosses the notification
 * layer - the `conversationDeleted` event is payload-less - so the delete stays content-safe in the
 * diagnostic log.
 *
 * "Currently viewing the deleted conversation" is detected from the live route param: `useParams({
 * strict: false })` reads the `/c/$conversationId` param without throwing when the row is rendered off
 * that route, so a delete from the sidebar while viewing a DIFFERENT conversation leaves the view put;
 * only a delete of the open conversation navigates away. The navigation target is the server's
 * resulting `activeId`; if that is null (the list is now empty) a fresh draft is minted from the
 * pre-delete list ids so the new id is unique, and the route lands on that empty draft.
 *
 * Focus after the delete keeps a screen-reader or keyboard user oriented. On SUCCESS the row unmounts,
 * so focus moves (deferred a frame) to the next row in the same `section` (or the previous when this was
 * last), or to the list heading when the section is now empty; a row with no section falls back to the
 * New conversation button. The success target is captured BEFORE the delete so the sibling lookup still
 * sees this row. On FAILURE the row survives, so focus returns to it (`linkId`). When the deleted
 * conversation was the one on screen the route navigates and the new surface's `h1` route focus (fired
 * ~50ms later) lands last and wins over the nav anchor.
 *
 * @param id - The conversation id to delete.
 * @param focus - Where the row sits, so focus can land sensibly after it leaves the list.
 * @returns The {@link DeleteConversationAction}.
 */
export function useDeleteConversation(
  id: string,
  focus: DeleteConversationFocus,
): DeleteConversationAction {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const viewedId = useParams({ strict: false, select: (params) => params.conversationId });

  const remove = async (): Promise<void> => {
    // Captured before the delete: a sectioned row hands focus to its next section sibling (or the list
    // heading when none remains); a flat row falls back to the always-present New conversation button.
    const successFocusId =
      focus.sectionId !== undefined
        ? (nextSiblingRowId(sectionLinkPrefix(focus.sectionId), focus.linkId) ??
          CONVERSATIONS_HEADING_ID)
        : NEW_CONVERSATION_BUTTON_ID;
    try {
      const result = await deleteConversation(id);
      invalidateConversation(queryClient, id);
      // Tell the other tabs: the viewed surface (if this is it) flips to "deleted elsewhere"; others
      // drop the row from the list. Both events are content-safe (id only). `post` never throws.
      conversationsBroadcaster.post({ type: 'conversation-deleted', id });
      conversationsBroadcaster.post({ type: 'list-changed' });
      notify({ type: 'conversationDeleted' });
      // Only navigate when the deleted conversation is the one on screen; a sidebar delete of another
      // conversation must leave the current view untouched.
      if (viewedId === id) {
        if (result.activeId) {
          void navigate({ to: '/c/$conversationId', params: { conversationId: result.activeId } });
        } else {
          // No conversations remain: mint a fresh draft (avoiding the ids still in the cached list) and
          // land on it, so the surface is an empty draft rather than a 404 or a blank page.
          const list = queryClient.getQueryData(conversationListQuery.queryKey);
          const takenIds = new Set((list?.conversations ?? []).map((summary) => summary.id));
          const draftId = useDraftStore.getState().newDraft(takenIds);
          void navigate({ to: '/c/$conversationId', params: { conversationId: draftId } });
        }
      }
      // The deleted row unmounted, so its opener focus has nowhere to land; anchor focus deferred past
      // the list re-render. For an on-screen delete the route's later h1 focus wins over this anchor.
      requestAnimationFrame(() => document.getElementById(successFocusId)?.focus());
    } catch {
      // The delete rejected: nothing was removed, so the row survives. Delete performs NO optimistic
      // list mutation - it deletes server-side then invalidates - so there is nothing to roll back and
      // no sibling row can be clobbered; the rollback is already precise. Announce (content-safe,
      // payload-less) and return focus to the row's link rather than letting the closed dialog strand it.
      notify({ type: 'conversationDeleteFailed' });
      requestAnimationFrame(() => document.getElementById(focus.linkId)?.focus());
    }
  };

  return { remove };
}
