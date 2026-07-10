import { useEffect } from 'react';

import { setActiveConversation } from '../../lib/conversation/conversationMutations';

/**
 * Persist `conversationId` as the active conversation whenever an EXISTING conversation is shown, so
 * a later page reload or full server restart restores the conversation the user last opened - not
 * only the last one they sent a message in. The entry route prefers the stored active pointer over
 * the most-recent conversation, so keeping that pointer in step with what the user opened makes
 * restore predictable ("the chat I was last in comes back").
 *
 * Skipped for a draft (`exists === false`), whose id has no persisted row yet - the server marks a
 * draft active when its first turn persists, so writing it here would only dangle. Best-effort: the
 * active pointer is non-critical session state, so a failed write is swallowed rather than surfaced
 * (mirrors the post-branch `setActiveConversation` call). Content-safe: only the conversation id
 * crosses the boundary, never the title or any message text.
 *
 * @param conversationId - The conversation id currently shown.
 * @param exists - Whether that conversation is persisted (a loaded detail, not a draft or a pending
 *   or failed load).
 */
export function useMarkActiveConversation(conversationId: string, exists: boolean): void {
  useEffect(() => {
    if (!exists) return;
    void setActiveConversation(conversationId).catch(() => {});
  }, [conversationId, exists]);
}
