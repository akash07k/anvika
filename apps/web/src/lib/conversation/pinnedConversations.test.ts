import { describe, expect, it } from 'vitest';

import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import { pinnedConversationsByRecency } from './pinnedConversations';

/** Build a minimal conversation summary fixture with just the fields the helper reads. */
function summary(id: string, pinnedAt: number | null): ConversationSummary {
  return { id, title: id, updatedAt: 0, revision: 0, pinnedAt };
}

describe('pinnedConversationsByRecency', () => {
  it('returns an empty array when nothing is pinned', () => {
    expect(pinnedConversationsByRecency([summary('a', null), summary('b', null)])).toEqual([]);
  });

  it('returns the single pinned conversation', () => {
    const result = pinnedConversationsByRecency([summary('a', null), summary('b', 5)]);
    expect(result.map((c) => c.id)).toEqual(['b']);
  });

  it('sorts pinned conversations by pinnedAt descending (newest-pinned first)', () => {
    const result = pinnedConversationsByRecency([
      summary('old', 1),
      summary('new', 9),
      summary('mid', 5),
    ]);
    expect(result.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('ignores unpinned conversations while ordering the pinned ones', () => {
    const result = pinnedConversationsByRecency([
      summary('unpinned', null),
      summary('pinned-early', 2),
      summary('pinned-late', 7),
    ]);
    expect(result.map((c) => c.id)).toEqual(['pinned-late', 'pinned-early']);
  });

  it('breaks ties on equal pinnedAt by id ascending (deterministic slot order)', () => {
    const result = pinnedConversationsByRecency([
      summary('charlie', 5),
      summary('alpha', 5),
      summary('bravo', 5),
    ]);
    expect(result.map((c) => c.id)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('does not mutate its input', () => {
    const input = [summary('a', 1), summary('b', 2)];
    const snapshot = input.map((c) => c.id);
    pinnedConversationsByRecency(input);
    expect(input.map((c) => c.id)).toEqual(snapshot);
  });
});
