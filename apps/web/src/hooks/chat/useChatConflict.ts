import { useCallback, useEffect, type RefObject } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { reportClientError } from '../../diagnostics/reportClientError';
import { ApiClientError } from '../../lib/api-client';
import {
  conversationListQuery,
  invalidateConversation,
} from '../../lib/conversation/conversationQueries';
import { onConversationConflict } from '../../lib/conversation/conversationMutations';
import { conversationsBroadcaster } from '../../lib/conversation/conversationsBroadcast';
import { isNoModelError } from '../../components/isNoModelError';
import { notify } from '../../notifications/notifier';

/** What {@link useChatConflict} needs to branch the error path and refresh the revision. */
export interface ChatConflictOptions {
  /** The current chat error, or `undefined` for none (the observable truth). */
  error: Error | undefined;
  /** The active conversation id, or `undefined` for a draft turn (no conflict possible). */
  conversationId: string | undefined;
  /** Holds the in-flight turn's correlation id, reported alongside a generic error. */
  requestIdRef: RefObject<string>;
  /** Dedup guard: the last announced error message, so a re-render does not re-speak it. */
  announcedError: RefObject<string | null>;
  /** Ref to the Retry button, focused for a generic error. */
  retryRef: RefObject<HTMLButtonElement | null>;
  /** Ref to the Settings link, focused for a no-model error. */
  settingsLinkRef: RefObject<HTMLAnchorElement | null>;
  /** The reasoning-override pending write the send must await before proceeding. */
  reasoningBeforeSend: () => Promise<void>;
  /** The model-override pending write the send must await before proceeding. */
  modelBeforeSend: () => Promise<void>;
}

/** What {@link useChatConflict} returns: the post-finish refresh and the composed send gate. */
export interface ChatConflict {
  /**
   * Invalidate the conversation list and this conversation's detail after a turn finishes. The
   * active `useConversationList` observer sees the stale mark and refetches in the background,
   * so `useBaseRevision` returns a fresh revision by the time the user sends the next turn.
   * Wire into `useChat`'s `onFinish`.
   */
  onTurnFinished: () => void;
  /**
   * The composed send gate: await the reasoning-override AND model-override pending writes AND
   * ensure the conversation list is loaded (so a first send has a list to read). Always resolves -
   * never rejects the send gate.
   *
   * `baseRevision` freshness between turns is maintained by the active `useConversationList`
   * observer, which TanStack Query refetches in the background when `onTurnFinished` invalidates
   * the list key (default `refetchType: 'active'`). The server's pre-stream 409 (`conflict`) is
   * the AUTHORITATIVE stale-send guard: a rare rapid resend that races that background refetch is
   * safely rejected by the server - never data loss, never a spurious conflict for a single user.
   */
  beforeSend: () => Promise<void>;
}

/**
 * Encapsulates the chat optimistic-concurrency concerns extracted from `ConversationView` (ADR 0007
 * line cap): the 409-conflict-vs-generic error branch, the post-finish revision refresh, and the
 * composed send gate. A conflict ({@link ApiClientError} code `conflict`) means the conversation
 * changed elsewhere: the stale caches are invalidated and a content-safe assertive notice fires, but
 * the composer is left intact and focus is NOT stolen, so the user can resend. Every
 * other error keeps the single-source generic path: announce once and move focus to Retry (or the
 * Settings link for a no-model error).
 *
 * @param options - See {@link ChatConflictOptions}.
 * @returns The {@link ChatConflict} `onTurnFinished` and composed `beforeSend`.
 */
export function useChatConflict({
  error,
  conversationId,
  requestIdRef,
  announcedError,
  retryRef,
  settingsLinkRef,
  reasoningBeforeSend,
  modelBeforeSend,
}: ChatConflictOptions): ChatConflict {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (error && error.message !== announcedError.current) {
      announcedError.current = error.message;
      // A 409 conflict is not a generic failure: refresh the stale caches, announce a content-safe
      // assertive notice, and leave the composer/focus alone so the user can resend.
      if (
        conversationId &&
        error instanceof ApiClientError &&
        error.code === 'conflict' &&
        onConversationConflict(conversationId, error, queryClient).isConflict
      ) {
        notify({ type: 'conversationChangedElsewhere' });
      } else {
        notify({ type: 'error', message: error.message });
        reportClientError(error, requestIdRef.current);
        if (isNoModelError(error)) settingsLinkRef.current?.focus();
        else retryRef.current?.focus();
      }
    } else if (!error) {
      announcedError.current = null;
    }
    return undefined;
  }, [error, conversationId, queryClient, announcedError, requestIdRef, retryRef, settingsLinkRef]);

  const onTurnFinished = useCallback(() => {
    invalidateConversation(queryClient, conversationId);
    // Tell the other tabs THIS turn landed so their list reorders and the viewed detail refreshes.
    // Content-safe (ids only) and best-effort - `post` never throws.
    if (conversationId) {
      conversationsBroadcaster.post({ type: 'conversation-updated', id: conversationId });
    }
    conversationsBroadcaster.post({ type: 'list-changed' });
  }, [queryClient, conversationId]);

  const beforeSend = useCallback(async () => {
    await reasoningBeforeSend();
    await modelBeforeSend();
    // Ensure the conversation list is loaded before the first send. ensureQueryData returns the
    // cached value immediately when data already exists (it does NOT force a refresh of stale data).
    // baseRevision freshness is maintained by the active useConversationList observer, which
    // refetches in the background after onTurnFinished invalidates the list key. The server's
    // pre-stream 409 is the authoritative stale-send guard for all clients.
    // Fail-soft: never let a fetch failure reject the send gate.
    await queryClient.ensureQueryData(conversationListQuery).catch(() => undefined);
  }, [queryClient, reasoningBeforeSend, modelBeforeSend]);

  return { onTurnFinished, beforeSend };
}
