import { z } from 'zod';

/**
 * The Crockford base32 alphabet, lowercase: digits 0-9 then a-z excluding i, l, o, and u
 * (the four letters Crockford drops to avoid visual/phonetic confusion). Exactly 32 symbols,
 * so a uniformly random byte maps to a symbol with `byte % 32` and zero modulo bias.
 */
const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

/** The number of entropy characters in a conversation id (two groups of three). */
const ID_BODY_LENGTH = 6;

/** The position the hyphen is inserted at, splitting the body into two groups of three. */
const ID_GROUP_SIZE = 3;

/** Defensive cap on re-mint attempts; never reached for the single-owner exhaustive set. */
const MINT_ATTEMPT_CAP = 100;

/**
 * A conversation id: a short, screen-reader-friendly `xxx-xxx` value, two groups of three
 * Crockford base32 lowercase characters joined by a hyphen (for example `jwq-112` or `k7m-2qp`).
 * The character class `[0-9a-hjkmnp-tv-z]` is exactly Crockford base32 lowercase (0-9 and a-z
 * minus i, l, o, u = 32 symbols). The hyphen is part of the canonical id: it is stored in the
 * database and appears in the URL (`/c/xxx-xxx`). Client-minted via {@link mintConversationId};
 * the server validates this format at every boundary.
 */
export const ConversationIdSchema = z
  .string()
  .regex(/^[0-9a-hjkmnp-tv-z]{3}-[0-9a-hjkmnp-tv-z]{3}$/);

/** A validated conversation id. */
export type ConversationId = z.infer<typeof ConversationIdSchema>;

/**
 * Mint a fresh `xxx-xxx` conversation id from cryptographically strong randomness.
 *
 * Each of the six body characters is drawn by mapping a uniformly random byte into the
 * 32-symbol Crockford alphabet with `byte % 32`; because 256 is an exact multiple of 32 this
 * has zero modulo bias, so no rejection sampling is needed. The hyphen is inserted between the
 * third and fourth characters to produce the canonical form.
 *
 * When `taken` is supplied the mint re-rolls until the candidate is absent from the set. Used by
 * the single-owner client (which holds the COMPLETE set of existing conversation ids) this is an
 * EXHAUSTIVE, deterministic uniqueness check, not a probabilistic one: a clash with any existing
 * conversation is impossible. A defensive attempt cap guards against a degenerate exhausted set
 * and throws rather than looping forever; it is never reached in practice.
 *
 * @param taken - An optional set of ids the result must avoid. Omit it to mint without a check.
 * @returns A freshly minted conversation id in `xxx-xxx` form that is not in `taken`.
 * @throws If the attempt cap is exceeded (only possible with a pathologically saturated set).
 */
export function mintConversationId(taken?: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < MINT_ATTEMPT_CAP; attempt += 1) {
    const candidate = generateCandidate();
    if (taken === undefined || !taken.has(candidate)) return candidate;
  }
  throw new Error('mintConversationId: exhausted attempts finding a free conversation id');
}

/**
 * Build one candidate `xxx-xxx` id from six random bytes. Internal helper for
 * {@link mintConversationId}; performs no uniqueness check.
 *
 * @returns A syntactically valid conversation id (uniqueness not guaranteed).
 */
function generateCandidate(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ID_BODY_LENGTH));
  let body = '';
  for (let i = 0; i < ID_BODY_LENGTH; i += 1) {
    const byte = bytes[i] ?? 0;
    body += ID_ALPHABET[byte % ID_ALPHABET.length];
    if (i === ID_GROUP_SIZE - 1) body += '-';
  }
  return body;
}

/**
 * Whether `value` is a syntactically valid conversation id (the `xxx-xxx` Crockford form). The
 * predicate companion to {@link ConversationIdSchema}, used at validation boundaries and in
 * client-side draft/id assertions to reject anything that is not a canonical id.
 *
 * @param value - The candidate id.
 * @returns True when `value` parses as a conversation id.
 */
export function isConversationId(value: unknown): value is string {
  return ConversationIdSchema.safeParse(value).success;
}
