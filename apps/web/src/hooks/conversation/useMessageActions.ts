import { useCallback, useMemo } from 'react';

import { useBranchConversation } from '../../components/conversations/useBranchConversation';

/**
 * The per-message action callbacks for a conversation surface. Each field is optional; an absent
 * field hides its menu item (so a draft, which cannot branch, shows no Branch item).
 */
export interface MessageActions {
  /** Branch through a 0-based message index; `undefined` when branching is unavailable (draft). */
  branchFromHere?: ((index: number) => void) | undefined;
  /**
   * Regenerate the assistant message with the given stable id. Always defined here (regenerate is
   * not persisted-gated like branch): {@link MessageActionsMenu} role-filters it to assistant rows
   * and disables it while a turn is streaming.
   */
  regenerate?: ((messageId: string) => void) | undefined;
  /**
   * Edit a user message by id and resend (truncate-and-resend). Always defined here (gating and
   * role-filtering happen in the menu/UI): the menu restricts it to user rows. Takes the message id
   * and the edited text and forwards both to the chat-owned `editMessage`.
   */
  edit?: ((messageId: string, text: string) => void) | undefined;
}

/** Dependencies injected into {@link useMessageActions} so the chat-owned actions stay decoupled. */
export interface MessageActionsDeps {
  /** Regenerate a specific assistant message by id (from `useChatActions`). */
  regenerateMessage: (messageId: string) => void;
  /** Edit a user message by id and resend (truncate-and-resend) (from `useChatActions`). */
  editMessage: (messageId: string, text: string) => void;
}

/**
 * Provide the per-message action bundle for a conversation surface. It carries `branchFromHere`,
 * `regenerate`, and `edit` so callers thread a single prop.
 *
 * Branching requires a PERSISTED conversation: a `conversationId` AND a defined `baseRevision`
 * (which is `undefined` for a draft not yet in the list cache - see `useBaseRevision`). On a draft
 * `branchFromHere` is `undefined`, so {@link MessageActionsMenu} hides the Branch item. When
 * persisted it is a stable callback that branches through the given 0-based message index via
 * {@link useBranchConversation}; the branch action never rejects, so it is fire-and-forget (`void`).
 *
 * `regenerate` is always provided (it is not persisted-gated): it is the injected
 * `deps.regenerateMessage` from `useChatActions`. {@link MessageActionsMenu} role-filters it to
 * assistant rows and disables it while a turn is streaming.
 *
 * `edit` is likewise always provided: it is the injected `deps.editMessage` from `useChatActions`.
 * The menu/UI restricts it to user rows; here it is unconditionally available.
 *
 * @param conversationId - The current conversation id, or `undefined` on a draft surface.
 * @param baseRevision - The conversation's last-seen revision, or `undefined` when not yet persisted.
 * @param deps - Chat-owned action dependencies; see {@link MessageActionsDeps}.
 * @returns The message-actions bundle for this surface.
 */
export function useMessageActions(
  conversationId: string | undefined,
  baseRevision: number | undefined,
  deps: MessageActionsDeps,
): MessageActions {
  const isPersisted = conversationId !== undefined && baseRevision !== undefined;
  const { branch } = useBranchConversation(conversationId ?? '');
  const branchCallback = useCallback(
    (index: number) => {
      void branch(index);
    },
    [branch],
  );
  // Memoized so the bundle keeps a stable identity across renders (the inner callbacks are already
  // stable), which future-proofs any consumer that wraps a row in React.memo.
  return useMemo(
    () => ({
      branchFromHere: isPersisted ? branchCallback : undefined,
      regenerate: deps.regenerateMessage,
      edit: deps.editMessage,
    }),
    [isPersisted, branchCallback, deps.regenerateMessage, deps.editMessage],
  );
}
