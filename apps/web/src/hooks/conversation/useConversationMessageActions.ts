import { useMemo } from 'react';

import { useMessageActions, type MessageActions } from './useMessageActions';
import type { MessageEditConfig } from '../../components/message/messageEditConfig';

/** Inputs to {@link useConversationMessageActions}. */
export interface ConversationMessageActionsOptions {
  /** The current conversation id, or `undefined` on a draft surface. */
  conversationId: string | undefined;
  /** The conversation's last-seen revision, or `undefined` when not yet persisted. */
  baseRevision: number | undefined;
  /** Regenerate a specific assistant message by id (from `useChatActions`). */
  regenerateMessage: (messageId: string) => void;
  /** Edit a user message by id and resend (from `useChatActions`). */
  editMessage: (messageId: string, text: string) => void;
  /** The user's send-key mode for the inline editor. */
  sendKeyMode: MessageEditConfig['sendKeyMode'];
  /** The keymap send binding for the inline editor. */
  sendBinding: string;
}

/** The memoized per-message action bundle and inline-editor config a conversation surface threads. */
export interface ConversationMessageActions {
  /** The per-message action callbacks (branch, regenerate, edit) for the message list. */
  messageActions: MessageActions;
  /** The send-key config the inline editor needs, with a stable identity across renders. */
  editConfig: MessageEditConfig;
}

/**
 * Assemble and memoize the per-message action bundle and inline-editor config for a conversation
 * surface. Extracted from `ConversationView` so that surface stays under the 200-line cap (ADR 0007).
 *
 * The `regenerateMessage`/`editMessage` callbacks are wrapped in a memoized `deps` object so the
 * `messageActions` bundle keeps a stable identity across renders (it only changes when one of those
 * callbacks does), and `editConfig` is likewise memoized over the send-key inputs - both future-proof
 * the message list against any downstream `React.memo`.
 *
 * @param options - See {@link ConversationMessageActionsOptions}.
 * @returns The memoized {@link ConversationMessageActions}.
 */
export function useConversationMessageActions({
  conversationId,
  baseRevision,
  regenerateMessage,
  editMessage,
  sendKeyMode,
  sendBinding,
}: ConversationMessageActionsOptions): ConversationMessageActions {
  const actionDeps = useMemo(
    () => ({ regenerateMessage, editMessage }),
    [regenerateMessage, editMessage],
  );
  const messageActions = useMessageActions(conversationId, baseRevision, actionDeps);
  const editConfig = useMemo<MessageEditConfig>(
    () => ({ sendKeyMode, sendBinding }),
    [sendKeyMode, sendBinding],
  );
  return { messageActions, editConfig };
}
