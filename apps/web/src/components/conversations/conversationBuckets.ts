import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import { pinnedConversationsByRecency } from '../../lib/conversation/pinnedConversations';

/**
 * The seven section ids of the conversation nav. `pinned` and `recent` are SHORTCUT sections
 * that REPEAT conversations also shown in their authoritative time bucket; the five time buckets
 * (`last7`..`older`) are the complete archive where every conversation appears exactly once.
 */
export type SectionId = 'pinned' | 'recent' | 'last7' | 'last2w' | 'last30' | 'last3m' | 'older';

/**
 * The five archive buckets a conversation falls into by its `updatedAt`. Excludes the two
 * shortcut sections (`pinned`, `recent`), which are not derived from {@link bucketFor}.
 */
export type TimeBucketId = Exclude<SectionId, 'pinned' | 'recent'>;

/**
 * The screen-reader-facing label for each section, defined once so the heading text cannot drift
 * between the helper and the rendering.
 */
export const SECTION_LABELS: Record<SectionId, string> = {
  pinned: 'Pinned',
  recent: 'Recent',
  last7: 'Last 7 days',
  last2w: 'Last 2 weeks',
  last30: 'Last 30 days',
  last3m: 'Last 3 months',
  older: 'Older',
};

/** How many of the most-recently-updated conversations the Recent shortcut section holds. */
export const RECENT_LIMIT = 10;

/** Seconds in one day, used to convert the `updatedAt` age into a day-bounded bucket. */
const DAY = 86400;

/**
 * One rendered conversation row within a section. `showPinnedSuffix` is true when the conversation
 * is pinned but shown OUTSIDE the Pinned section (so a "(Pinned)" marker tells the user this row is
 * a repeat of a pinned conversation); it is always false inside the Pinned section itself.
 */
export interface SectionItem {
  /** The conversation summary this row renders. */
  summary: ConversationSummary;
  /** Whether to append a "(Pinned)" suffix because this is a pinned conversation shown elsewhere. */
  showPinnedSuffix: boolean;
}

/** A non-empty conversation nav section: its id, its screen-reader label, and its rows. */
export interface ConversationSection {
  /** The section id, also used as the accordion item value. */
  id: SectionId;
  /** The human-readable heading label from {@link SECTION_LABELS}. */
  label: string;
  /** The rows rendered under this section, in input order. */
  items: SectionItem[];
}

/**
 * Map a conversation's `updatedAt` to exactly one archive time bucket. The age is
 * `d = max(0, now - updatedAt)` seconds, so a future `updatedAt` (now < updatedAt) clamps to `0`
 * and lands in `last7`. Boundaries are inclusive of the lower section: `d <= 7d -> last7`,
 * `d <= 14d -> last2w`, `d <= 30d -> last30`, `d <= 90d -> last3m`, else `older`.
 *
 * `now` (unix-epoch seconds) is injected by the caller; this module never reads the clock so it
 * stays pure and deterministic for tests.
 */
export function bucketFor(updatedAt: number, now: number): TimeBucketId {
  const d = Math.max(0, now - updatedAt);
  if (d <= 7 * DAY) return 'last7';
  if (d <= 14 * DAY) return 'last2w';
  if (d <= 30 * DAY) return 'last30';
  if (d <= 90 * DAY) return 'last3m';
  return 'older';
}

/** Wrap a summary as a section item, computing its pinned-suffix flag for the given section. */
function toItem(summary: ConversationSummary, sectionId: SectionId): SectionItem {
  return { summary, showPinnedSuffix: summary.pinnedAt !== null && sectionId !== 'pinned' };
}

/**
 * The Pinned shortcut: every pinned conversation, newest-pinned first. The slot order is sourced
 * from {@link pinnedConversationsByRecency} so the visible Pinned section and the pinned quick-nav
 * shortcuts (Ctrl+Alt+1..0) share one ordering and can never drift.
 */
function pinnedItems(conversations: ConversationSummary[]): SectionItem[] {
  return pinnedConversationsByRecency(conversations).map((c) => toItem(c, 'pinned'));
}

/**
 * Build the ordered, non-empty conversation nav sections from the server's `updatedAt`-DESC list.
 *
 * Sections are assembled in two layers. The two SHORTCUT sections repeat conversations also shown
 * in the archive: Pinned holds every conversation with `pinnedAt != null` sorted newest-pinned
 * first, and Recent holds the first {@link RECENT_LIMIT} of the already-sorted input. The five
 * time buckets form the COMPLETE archive - every conversation lands in exactly one bucket by its
 * `updatedAt` via {@link bucketFor}, including pinned ones (which therefore appear up to three
 * times). Empty sections are omitted, and the result is returned in the fixed order pinned, recent,
 * last7, last2w, last30, last3m, older.
 *
 * Pure: `now` (unix-epoch seconds) is injected; the module never calls `Date.now()`.
 */
export function buildSections(
  conversations: ConversationSummary[],
  now: number,
): ConversationSection[] {
  const buckets: Record<TimeBucketId, SectionItem[]> = {
    last7: [],
    last2w: [],
    last30: [],
    last3m: [],
    older: [],
  };
  for (const c of conversations) {
    const id = bucketFor(c.updatedAt, now);
    buckets[id].push(toItem(c, id));
  }

  const candidates: Array<[SectionId, SectionItem[]]> = [
    ['pinned', pinnedItems(conversations)],
    ['recent', conversations.slice(0, RECENT_LIMIT).map((c) => toItem(c, 'recent'))],
    ['last7', buckets.last7],
    ['last2w', buckets.last2w],
    ['last30', buckets.last30],
    ['last3m', buckets.last3m],
    ['older', buckets.older],
  ];

  return candidates
    .filter(([, items]) => items.length > 0)
    .map(([id, items]) => ({ id, label: SECTION_LABELS[id], items }));
}
