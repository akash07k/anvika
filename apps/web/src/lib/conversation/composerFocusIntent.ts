/**
 * A one-shot "focus the composer" intent, SCOPED TO A CONVERSATION ID. It is set by an INTENTIONAL
 * conversation navigation (new conversation, advanced-dialog create, or quick-switch) and consumed
 * exactly once by the composer of the MATCHING conversation when it next mounts. Scoping to the id
 * means a stranded intent (e.g. a navigation whose destination never mounts a composer) can only ever
 * fire for its own conversation - never an unrelated composer mount. It is deliberately NOT React
 * state: a plain module value means a fresh page load starts with no intent, so a reload never
 * auto-focuses the composer; only an in-app navigation does.
 */
let pendingFocusConversationId: string | null = null;

/**
 * Request that the composer of the given conversation be focused when it next mounts.
 *
 * @param conversationId - The conversation whose composer should take focus on its next mount.
 */
export function requestComposerFocus(conversationId: string): void {
  pendingFocusConversationId = conversationId;
}

/**
 * Consume the pending composer-focus intent for a conversation. Returns `true` exactly once when a
 * matching {@link requestComposerFocus} is pending for `conversationId`, clearing the intent;
 * otherwise `false` (a non-matching pending intent is left intact for its own conversation).
 *
 * @param conversationId - The id of the conversation whose composer is mounting.
 * @returns Whether that composer should focus itself now.
 */
export function consumeComposerFocus(conversationId: string): boolean {
  if (pendingFocusConversationId === null || pendingFocusConversationId !== conversationId)
    return false;
  pendingFocusConversationId = null;
  return true;
}
