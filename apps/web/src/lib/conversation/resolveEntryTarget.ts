import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { useDraftStore } from '../../stores/draftStore';

/**
 * Resolve which conversation id the root entry route should land on (defensive redirect).
 *
 * Precedence: the persisted `activeId` when it still exists in the list; else the most-recent
 * conversation (the list is most-recent-first); else a stable draft id (reusing the existing
 * draft when one is already live, only minting a new one when none exists). A dangling `activeId`
 * not present in the list self-heals by falling through - the entry path never resolves to
 * a 404. Passing `null` (list fetch failed) falls through to the draft path so the entry never
 * dead-ends on a network failure.
 *
 * @param list - The validated conversation list and active pointer, or `null` when the list fetch
 *   failed (treated as an empty list - the entry falls back to a draft rather than dead-ending).
 * @returns The conversation id to redirect to.
 */
export function resolveEntryTarget(list: ConversationListResponse | null): string {
  if (list !== null) {
    if (list.activeId && list.conversations.some((c) => c.id === list.activeId)) {
      return list.activeId;
    }
    const mostRecent = list.conversations[0];
    if (mostRecent) return mostRecent.id;
  }
  const state = useDraftStore.getState();
  if (state.draftId !== null) return state.draftId;
  const taken = new Set((list?.conversations ?? []).map((c) => c.id));
  return state.newDraft(taken);
}
