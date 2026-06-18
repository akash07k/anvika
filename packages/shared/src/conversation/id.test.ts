import { describe, expect, it } from 'vitest';
import { ConversationIdSchema, isConversationId, mintConversationId } from './id';

describe('ConversationIdSchema', () => {
  it('accepts valid short ids', () => {
    expect(ConversationIdSchema.safeParse('jwq-112').success).toBe(true);
    expect(ConversationIdSchema.safeParse('k7m-2qp').success).toBe(true);
  });
  it('rejects a UUIDv7', () => {
    expect(ConversationIdSchema.safeParse('0190b6a0-7c2e-7c00-8e00-000000000000').success).toBe(
      false,
    );
  });
  it('rejects uppercase', () => {
    expect(ConversationIdSchema.safeParse('ABC-123').success).toBe(false);
  });
  it('rejects forbidden Crockford letters (i, l, o, u)', () => {
    expect(ConversationIdSchema.safeParse('ilo-uuu').success).toBe(false);
  });
  it('rejects a missing hyphen', () => {
    expect(ConversationIdSchema.safeParse('abc123').success).toBe(false);
  });
  it('rejects wrong group lengths', () => {
    expect(ConversationIdSchema.safeParse('ab-1234').success).toBe(false);
    expect(ConversationIdSchema.safeParse('abcd-12').success).toBe(false);
  });
  it('rejects empty', () => {
    expect(ConversationIdSchema.safeParse('').success).toBe(false);
  });
});

describe('mintConversationId', () => {
  it('mints a value that passes the schema and matches xxx-xxx', () => {
    const id = mintConversationId();
    expect(ConversationIdSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]{3}-[0-9a-hjkmnp-tv-z]{3}$/);
  });
  it('returns a fresh, valid id not present in the taken set', () => {
    // Seed a large taken set to exercise the avoidance loop; the result must be fresh and valid.
    const taken = new Set<string>();
    for (let i = 0; i < 500; i += 1) taken.add(mintConversationId(taken));
    const result = mintConversationId(taken);
    expect(taken.has(result)).toBe(false);
    expect(ConversationIdSchema.safeParse(result).success).toBe(true);
  });
});

describe('isConversationId', () => {
  it('returns true for a valid short id', () => {
    expect(isConversationId('jwq-112')).toBe(true);
  });
  it('returns false for a placeholder string', () => {
    expect(isConversationId('placeholder')).toBe(false);
  });
  it('returns false for a UUIDv7', () => {
    expect(isConversationId('0190b6a0-7c2e-7c00-8e00-000000000000')).toBe(false);
  });
  it('returns false for non-string input without throwing', () => {
    expect(isConversationId(123)).toBe(false);
  });
});
