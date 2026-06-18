import { describe, expect, it } from 'vitest';

import {
  BatchDeleteResultSchema,
  ConversationDetailSchema,
  ConversationListResponseSchema,
  ConversationSummarySchema,
  DeleteResultSchema,
  RetitleResultSchema,
} from './responses';

const VALID_ID = 'jwq-112';
const INVALID_ID = 'not-an-id';

const VALID_SUMMARY = {
  id: VALID_ID,
  title: 'T',
  updatedAt: 1,
  pinnedAt: null,
  revision: 0,
};

describe('ConversationSummarySchema', () => {
  it('accepts a valid summary', () => {
    expect(ConversationSummarySchema.safeParse(VALID_SUMMARY).success).toBe(true);
  });

  it('accepts an empty title (draft conversation)', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, title: '' }).success).toBe(true);
  });

  it('rejects a missing revision', () => {
    const { revision: _r, ...withoutRevision } = VALID_SUMMARY;
    expect(ConversationSummarySchema.safeParse(withoutRevision).success).toBe(false);
  });

  it('rejects a negative revision', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, revision: -1 }).success).toBe(
      false,
    );
  });

  it('rejects a non-integer revision', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, revision: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects a malformed id', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, id: INVALID_ID }).success).toBe(
      false,
    );
  });

  it('rejects a negative updatedAt', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, updatedAt: -1 }).success).toBe(
      false,
    );
  });

  it('accepts a numeric pinnedAt (a pinned conversation)', () => {
    expect(
      ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, pinnedAt: 1781785075 }).success,
    ).toBe(true);
  });

  it('accepts a null pinnedAt (an unpinned conversation)', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, pinnedAt: null }).success).toBe(
      true,
    );
  });

  it('rejects a missing pinnedAt', () => {
    const { pinnedAt: _p, ...withoutPinnedAt } = VALID_SUMMARY;
    expect(ConversationSummarySchema.safeParse(withoutPinnedAt).success).toBe(false);
  });

  it('rejects a negative pinnedAt', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, pinnedAt: -1 }).success).toBe(
      false,
    );
  });

  it('rejects a non-integer pinnedAt', () => {
    expect(ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, pinnedAt: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects a string pinnedAt', () => {
    expect(
      ConversationSummarySchema.safeParse({ ...VALID_SUMMARY, pinnedAt: '1781785075' }).success,
    ).toBe(false);
  });
});

describe('ConversationListResponseSchema', () => {
  it('accepts an empty conversation list with null activeId', () => {
    expect(
      ConversationListResponseSchema.safeParse({ conversations: [], activeId: null }).success,
    ).toBe(true);
  });

  it('accepts a valid summary with a valid activeId', () => {
    expect(
      ConversationListResponseSchema.safeParse({
        conversations: [VALID_SUMMARY],
        activeId: VALID_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects a summary with a malformed id', () => {
    expect(
      ConversationListResponseSchema.safeParse({
        conversations: [{ ...VALID_SUMMARY, id: INVALID_ID }],
        activeId: null,
      }).success,
    ).toBe(false);
  });

  it('rejects a malformed activeId', () => {
    expect(
      ConversationListResponseSchema.safeParse({
        conversations: [],
        activeId: INVALID_ID,
      }).success,
    ).toBe(false);
  });
});

describe('ConversationDetailSchema', () => {
  const VALID_DETAIL = {
    messages: [],
    reasoningOverride: null,
    modelId: null,
    title: 'T',
    revision: 0,
  };

  it('accepts a valid detail with null reasoningOverride', () => {
    expect(ConversationDetailSchema.safeParse(VALID_DETAIL).success).toBe(true);
  });

  it('accepts a concrete reasoning effort', () => {
    expect(
      ConversationDetailSchema.safeParse({ ...VALID_DETAIL, reasoningOverride: 'high' }).success,
    ).toBe(true);
  });

  it('rejects reasoningOverride of "inherit"', () => {
    expect(
      ConversationDetailSchema.safeParse({ ...VALID_DETAIL, reasoningOverride: 'inherit' }).success,
    ).toBe(false);
  });

  it('rejects a missing revision', () => {
    const { revision: _r, ...withoutRevision } = VALID_DETAIL;
    expect(ConversationDetailSchema.safeParse(withoutRevision).success).toBe(false);
  });

  it('rejects a negative revision', () => {
    expect(ConversationDetailSchema.safeParse({ ...VALID_DETAIL, revision: -1 }).success).toBe(
      false,
    );
  });

  it('accepts a concrete modelId', () => {
    expect(
      ConversationDetailSchema.safeParse({ ...VALID_DETAIL, modelId: 'anthropic:claude' }).success,
    ).toBe(true);
  });

  it('rejects a non-string, non-null modelId', () => {
    expect(ConversationDetailSchema.safeParse({ ...VALID_DETAIL, modelId: 42 }).success).toBe(
      false,
    );
  });
});

describe('BatchDeleteResultSchema', () => {
  it('accepts a valid result with null activeId', () => {
    expect(BatchDeleteResultSchema.safeParse({ deleted: 2, activeId: null }).success).toBe(true);
  });

  it('rejects a negative deleted count', () => {
    expect(BatchDeleteResultSchema.safeParse({ deleted: -1, activeId: null }).success).toBe(false);
  });

  it('accepts a zero deleted count (no-op batch)', () => {
    expect(BatchDeleteResultSchema.safeParse({ deleted: 0, activeId: null }).success).toBe(true);
  });
});

describe('DeleteResultSchema', () => {
  it('accepts null activeId', () => {
    expect(DeleteResultSchema.safeParse({ activeId: null }).success).toBe(true);
  });

  it('accepts a valid activeId', () => {
    expect(DeleteResultSchema.safeParse({ activeId: VALID_ID }).success).toBe(true);
  });
});

describe('RetitleResultSchema', () => {
  it('accepts a non-empty title', () => {
    expect(RetitleResultSchema.safeParse({ title: 'A title' }).success).toBe(true);
  });

  it('rejects an empty title', () => {
    expect(RetitleResultSchema.safeParse({ title: '' }).success).toBe(false);
  });
});
