import { describe, expect, it } from 'vitest';

import {
  BatchDeleteSchema,
  BranchConversationSchema,
  MAX_BATCH_DELETE_IDS,
  RenameConversationSchema,
  SetActiveSchema,
  SetPinSchema,
} from './requests';

const VALID_ID = 'aaa-111';
const ANOTHER_ID = 'bbb-222';

/** The Crockford base32 lowercase alphabet (digits 0-9 then a-z minus i, l, o, u). */
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Build `count` distinct valid short conversation ids by encoding the index into the trailing
 * three-character group in Crockford base32 (supports up to 32^3 = 32768 distinct ids).
 */
const idList = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const c0 = CROCKFORD[Math.floor(i / 1024) % 32];
    const c1 = CROCKFORD[Math.floor(i / 32) % 32];
    const c2 = CROCKFORD[i % 32];
    return `aaa-${c0}${c1}${c2}`;
  });

describe('RenameConversationSchema', () => {
  it('accepts a title and trims whitespace', () => {
    const result = RenameConversationSchema.safeParse({ title: '  Plan  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Plan');
    }
  });

  it('rejects a whitespace-only title (empty after trim)', () => {
    expect(RenameConversationSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('rejects a title that exceeds 200 characters', () => {
    const longTitle = 'a'.repeat(201);
    expect(RenameConversationSchema.safeParse({ title: longTitle }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(RenameConversationSchema.safeParse({ title: 'T', extra: 1 }).success).toBe(false);
  });

  it('accepts a title of exactly 200 characters', () => {
    const maxTitle = 'a'.repeat(200);
    expect(RenameConversationSchema.safeParse({ title: maxTitle }).success).toBe(true);
  });
});

describe('BatchDeleteSchema', () => {
  it('accepts an empty ids list (no-op)', () => {
    expect(BatchDeleteSchema.safeParse({ ids: [] }).success).toBe(true);
  });

  it('accepts a list of two valid short conversation ids', () => {
    const result = BatchDeleteSchema.safeParse({ ids: [VALID_ID, ANOTHER_ID] });
    expect(result.success).toBe(true);
  });

  it('rejects ids as a non-array string', () => {
    expect(BatchDeleteSchema.safeParse({ ids: 'x' }).success).toBe(false);
  });

  it('rejects a list containing a malformed id string', () => {
    expect(BatchDeleteSchema.safeParse({ ids: ['not-an-id'] }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(BatchDeleteSchema.safeParse({ ids: [], extra: true }).success).toBe(false);
  });

  it('accepts a list at the max length and rejects one over it', () => {
    expect(BatchDeleteSchema.safeParse({ ids: idList(MAX_BATCH_DELETE_IDS) }).success).toBe(true);
    expect(BatchDeleteSchema.safeParse({ ids: idList(MAX_BATCH_DELETE_IDS + 1) }).success).toBe(
      false,
    );
  });
});

describe('SetActiveSchema', () => {
  it('accepts a valid short conversation id', () => {
    expect(SetActiveSchema.safeParse({ id: VALID_ID }).success).toBe(true);
  });

  it('rejects a malformed id', () => {
    expect(SetActiveSchema.safeParse({ id: 'not-an-id' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(SetActiveSchema.safeParse({ id: VALID_ID, extra: 'x' }).success).toBe(false);
  });
});

describe('SetPinSchema', () => {
  it('accepts pinned true', () => {
    expect(SetPinSchema.safeParse({ pinned: true }).success).toBe(true);
  });

  it('accepts pinned false', () => {
    expect(SetPinSchema.safeParse({ pinned: false }).success).toBe(true);
  });

  it('rejects a missing pinned field', () => {
    expect(SetPinSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-boolean pinned value', () => {
    expect(SetPinSchema.safeParse({ pinned: 'yes' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(SetPinSchema.safeParse({ pinned: true, x: 1 }).success).toBe(false);
  });
});

describe('BranchConversationSchema', () => {
  it('accepts a new id and base revision with no throughIndex (whole conversation)', () => {
    expect(BranchConversationSchema.safeParse({ newId: 'abc-123', baseRevision: 0 }).success).toBe(
      true,
    );
  });

  it('accepts a throughIndex of zero and a base revision', () => {
    const result = BranchConversationSchema.safeParse({
      newId: 'abc-123',
      throughIndex: 0,
      baseRevision: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed new id', () => {
    expect(BranchConversationSchema.safeParse({ newId: 'nope', baseRevision: 0 }).success).toBe(
      false,
    );
  });

  it('rejects a negative throughIndex', () => {
    expect(
      BranchConversationSchema.safeParse({ newId: 'abc-123', throughIndex: -1, baseRevision: 0 })
        .success,
    ).toBe(false);
  });

  it('rejects a non-integer throughIndex', () => {
    expect(
      BranchConversationSchema.safeParse({ newId: 'abc-123', throughIndex: 1.5, baseRevision: 0 })
        .success,
    ).toBe(false);
  });

  it('rejects a missing base revision', () => {
    expect(BranchConversationSchema.safeParse({ newId: 'abc-123' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      BranchConversationSchema.safeParse({ newId: 'abc-123', baseRevision: 0, x: 1 }).success,
    ).toBe(false);
  });
});
