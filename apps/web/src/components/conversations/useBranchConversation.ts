import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { mintConversationId } from '@anvika/shared/conversation/id';
import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import {
  conversationsListKey,
  invalidateConversation,
} from '../../lib/conversation/conversationQueries';
import {
  branchConversation,
  onConversationConflict,
  setActiveConversation,
} from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { forceFocus } from '../../lib/message/messageFocus';
import { notify } from '../../notifications/notifier';

/**
 * Delay before moving focus to the composer of the branched conversation, so it lands a beat AFTER the
 * menu activation finishes and the new route mounts its composer. Mirrors `useNewConversation`'s
 * deferred focus: a screen reader follows a programmatic focus change far more reliably when it is not
 * mid-processing the event that triggered it.
 */
const FOCUS_DELAY_MS = 50;

/** The branch action for a single conversation row. */
export interface BranchConversationAction {
  /**
   * Branch the conversation: mint a unique new id, fork the source conversation into it, set it
   * active, navigate to it, focus its composer, and announce `conversationBranched`. On a 409 (the
   * source advanced elsewhere) it announces `conversationChangedElsewhere`; on any other failure it
   * announces `conversationBranchFailed`. Never rejects - every failure is surfaced to the user, not
   * thrown - so the fire-and-forget caller raises no unhandled rejection.
   *
   * @param throughIndex - When present, copy only the prefix through that 0-based message index
   *   (a partial branch from one message); when omitted, fork the WHOLE conversation (unchanged).
   */
  branch: (throughIndex?: number) => Promise<void>;
}

/**
 * Provide the branch action for one conversation. Neither the source id, the new id, nor any title
 * EVER crosses the notification layer - the `conversationBranched`, `conversationChangedElsewhere`,
 * and `conversationBranchFailed` events are payload-less - so branching stays content-safe in the
 * diagnostic log while the UI still navigates to and speaks the new conversation.
 *
 * Flow: read the live list cache to collect the taken ids (so the minted draft id is unique) and the
 * source's last-seen `revision` (the optimistic-concurrency `baseRevision`, defaulting to `0` when the
 * source is not yet cached). Then, inside the try, mint the unique new id (so its exhaustive-attempt
 * cap throwing is caught, not rejected) and call {@link branchConversation} with the caller's optional
 * `throughIndex` (omitted = the whole conversation is forked; present = the prefix through that 0-based
 * message index). On success invalidate the list so the new row appears, set the new
 * conversation active, navigate to `/c/$conversationId`, defer-focus its composer (reusing the
 * `id="composer"` + {@link forceFocus} mechanism that `useNewConversation` uses), and announce the
 * branch. On failure, {@link onConversationConflict} distinguishes a 409 (the source changed
 * elsewhere - route through `conversationChangedElsewhere`) from any other error
 * (`conversationBranchFailed`); the error is NOT re-thrown.
 *
 * @param sourceId - The conversation id to branch from.
 * @returns The {@link BranchConversationAction}.
 */
export function useBranchConversation(sourceId: string): BranchConversationAction {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Memoized so its identity is stable across renders (deps are the only non-module values it closes
  // over: `sourceId` prop, plus the stable `queryClient`/`navigate` from their hooks). This makes the
  // per-message `useMessageActions` memo of `branchFromHere` genuinely effective without altering the
  // 5b.6 conflict/notification/never-reject behavior.
  const branch = useCallback(
    async (throughIndex?: number): Promise<void> => {
      const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
      const conversations = list?.conversations ?? [];
      const taken = new Set(conversations.map((c) => c.id));
      const baseRevision = conversations.find((c) => c.id === sourceId)?.revision ?? 0;
      let newId: string;
      try {
        // Minting is inside the try so its exhaustive-attempt cap throwing surfaces as
        // `conversationBranchFailed` (the non-409 catch arm) instead of rejecting the promise. ONLY the
        // `branchConversation` persistence call decides success/failure - see the success block below.
        newId = mintConversationId(taken);
        await branchConversation(sourceId, newId, baseRevision, throughIndex);
      } catch (err) {
        // The branch did NOT persist. A 409 means the source advanced elsewhere, so nothing was branched;
        // route through the shared conflict notice (content-safe). Any other failure is the generic branch
        // failure. Never re-thrown: the caller dispatches `branch` fire-and-forget, so
        // swallowing-after-announcing avoids an unhandled rejection.
        if (onConversationConflict(sourceId, err, queryClient).isConflict) {
          notify({ type: 'conversationChangedElsewhere' });
        } else {
          notify({ type: 'conversationBranchFailed' });
        }
        return;
      }
      // The branch IS persisted server-side. Announce success NOW, then run set-active / navigate / focus
      // as BEST-EFFORT follow-ups: a transient failure in any of them must not flip the outcome to
      // "failed" (which would mis-report a real success to a screen-reader user, and a retry would mint a
      // second, duplicate branch). `setActiveConversation` is detached with its own `.catch` so a rejected
      // active-PUT cannot surface as an unhandled rejection.
      notify({ type: 'conversationBranched' });
      invalidateConversation(queryClient, undefined);
      // A new conversation joined the list: tell the other tabs to refresh their list. Content-safe.
      conversationsBroadcaster.post({ type: 'list-changed' });
      void setActiveConversation(newId).catch(() => {});
      void navigate({ to: '/c/$conversationId', params: { conversationId: newId } });
      // Defer the focus out of the menu activation and past the route mount, then force a real focus
      // event on the composer the branched surface renders (same mechanism as the create flow).
      setTimeout(() => forceFocus(document.getElementById('composer')), FOCUS_DELAY_MS);
    },
    [sourceId, queryClient, navigate],
  );

  return { branch };
}
