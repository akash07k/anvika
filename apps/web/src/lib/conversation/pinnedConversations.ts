import type { ConversationSummary } from '@anvika/shared/conversation/responses';

/**
 * The pinned conversations in slot order: every conversation with `pinnedAt != null`, sorted
 * newest-pinned first (`pinnedAt` descending). This is the single source of "pinned in slot order",
 * shared by the Pinned nav section (via `conversationBuckets`' `pinnedItems`) and the pinned
 * quick-nav shortcuts, so the visible Pinned order and the Ctrl+Alt+1..0 slot order never drift.
 *
 * Pure: it neither reads the clock nor mutates its input (it copies via `toSorted`), so it is
 * deterministic for tests. Unpinned rows (`pinnedAt === null`) are excluded.
 *
 * Ties (equal `pinnedAt`) break by `id` ascending. The server stores `pinnedAt` at epoch-SECONDS
 * resolution, so two conversations pinned within the same second would otherwise sort in an
 * input-dependent (effectively arbitrary) order that could shuffle a quick-nav slot between refetches;
 * the `id` tiebreaker makes the slot order fully deterministic and stable.
 *
 * @param conversations - The full conversation list (any order; the server sends `updatedAt`-DESC).
 * @returns The pinned conversations, newest-pinned first (ties broken by `id` ascending).
 */
export function pinnedConversationsByRecency(
  conversations: readonly ConversationSummary[],
): ConversationSummary[] {
  return conversations
    .filter((c): c is ConversationSummary & { pinnedAt: number } => c.pinnedAt !== null)
    .toSorted((a, b) => b.pinnedAt - a.pinnedAt || a.id.localeCompare(b.id));
}
