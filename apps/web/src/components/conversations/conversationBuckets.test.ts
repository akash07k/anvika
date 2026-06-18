import { describe, expect, it } from 'vitest';

import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import {
  buildSections,
  bucketFor,
  RECENT_LIMIT,
  SECTION_LABELS,
  type SectionId,
} from './conversationBuckets';

const DAY = 86400;
const NOW = 100 * DAY;

/** Build a `ConversationSummary` fixture with all fields populated. */
function summary(
  id: string,
  updatedAt: number,
  pinnedAt: number | null = null,
): ConversationSummary {
  return { id, title: `Title ${id}`, updatedAt, pinnedAt, revision: 1 };
}

describe('bucketFor', () => {
  it('clamps a future updatedAt (now < updatedAt) to last7', () => {
    expect(bucketFor(NOW + DAY, NOW)).toBe('last7');
  });

  it('puts d = 0 in last7', () => {
    expect(bucketFor(NOW, NOW)).toBe('last7');
  });

  it('treats exactly 7 days as last7 and 7d+1s as last2w', () => {
    expect(bucketFor(NOW - 7 * DAY, NOW)).toBe('last7');
    expect(bucketFor(NOW - 7 * DAY - 1, NOW)).toBe('last2w');
  });

  it('treats exactly 14 days as last2w and 14d+1s as last30', () => {
    expect(bucketFor(NOW - 14 * DAY, NOW)).toBe('last2w');
    expect(bucketFor(NOW - 14 * DAY - 1, NOW)).toBe('last30');
  });

  it('treats exactly 30 days as last30 and 30d+1s as last3m', () => {
    expect(bucketFor(NOW - 30 * DAY, NOW)).toBe('last30');
    expect(bucketFor(NOW - 30 * DAY - 1, NOW)).toBe('last3m');
  });

  it('treats exactly 90 days as last3m and 90d+1s as older', () => {
    expect(bucketFor(NOW - 90 * DAY, NOW)).toBe('last3m');
    expect(bucketFor(NOW - 90 * DAY - 1, NOW)).toBe('older');
  });
});

describe('buildSections', () => {
  it('returns [] for an empty input', () => {
    expect(buildSections([], NOW)).toEqual([]);
  });

  it('puts every pinnedAt != null row in Pinned, sorted by pinnedAt DESC', () => {
    const list = [
      summary('a', NOW, 10),
      summary('b', NOW, 30),
      summary('c', NOW, null),
      summary('d', NOW, 20),
    ];
    const pinned = buildSections(list, NOW).find((s) => s.id === 'pinned');
    expect(pinned?.items.map((i) => i.summary.id)).toEqual(['b', 'd', 'a']);
  });

  it('caps Recent at the first RECENT_LIMIT (10) of the input', () => {
    expect(RECENT_LIMIT).toBe(10);
    const list = Array.from({ length: 12 }, (_, n) => summary(`r${n}`, NOW - n));
    const recent = buildSections(list, NOW).find((s) => s.id === 'recent');
    expect(recent?.items).toHaveLength(10);
    expect(recent?.items.map((i) => i.summary.id)).toEqual(
      Array.from({ length: 10 }, (_, n) => `r${n}`),
    );
  });

  it('shows a pinned recent conversation in Pinned, Recent, and its time bucket', () => {
    const sections = buildSections([summary('x', NOW, 5)], NOW);
    expect(sections.map((s) => s.id)).toEqual(['pinned', 'recent', 'last7']);
    for (const s of sections) {
      expect(s.items.map((i) => i.summary.id)).toEqual(['x']);
    }
  });

  it('sets showPinnedSuffix true everywhere except inside the pinned section', () => {
    const sections = buildSections([summary('x', NOW, 5)], NOW);
    for (const s of sections) {
      for (const item of s.items) {
        expect(item.showPinnedSuffix).toBe(s.id !== 'pinned');
      }
    }
  });

  it('sets showPinnedSuffix false for an unpinned conversation', () => {
    const sections = buildSections([summary('y', NOW, null)], NOW);
    for (const s of sections) {
      for (const item of s.items) {
        expect(item.showPinnedSuffix).toBe(false);
      }
    }
  });

  it('omits empty sections', () => {
    const sections = buildSections([summary('y', NOW, null)], NOW);
    expect(sections.map((s) => s.id)).toEqual(['recent', 'last7']);
    expect(sections.some((s) => s.id === 'pinned')).toBe(false);
  });

  it('returns sections in the fixed order pinned, recent, last7, last2w, last30, last3m, older', () => {
    const list = [
      summary('p', NOW, 5),
      summary('a', NOW),
      summary('b', NOW - 8 * DAY),
      summary('c', NOW - 20 * DAY),
      summary('d', NOW - 40 * DAY),
      summary('e', NOW - 200 * DAY),
    ];
    const order: SectionId[] = ['pinned', 'recent', 'last7', 'last2w', 'last30', 'last3m', 'older'];
    expect(buildSections(list, NOW).map((s) => s.id)).toEqual(order);
  });

  it('labels each emitted section from SECTION_LABELS', () => {
    const sections = buildSections([summary('p', NOW, 5)], NOW);
    for (const s of sections) {
      expect(s.label).toBe(SECTION_LABELS[s.id]);
    }
  });
});
