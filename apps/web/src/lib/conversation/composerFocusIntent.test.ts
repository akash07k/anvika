import { afterEach, describe, expect, it } from 'vitest';

import { consumeComposerFocus, requestComposerFocus } from './composerFocusIntent';

afterEach(() => {
  // Drain any intent the test left pending so module state does not leak between tests.
  consumeComposerFocus('c1');
  consumeComposerFocus('c2');
});

describe('composerFocusIntent', () => {
  it('returns false when nothing was requested', () => {
    expect(consumeComposerFocus('c1')).toBe(false);
  });
  it('is a one-shot for the matching conversation: true once, then false', () => {
    requestComposerFocus('c1');
    expect(consumeComposerFocus('c1')).toBe(true);
    expect(consumeComposerFocus('c1')).toBe(false);
  });
  it('does not fire for a different conversation, and leaves the intent intact', () => {
    requestComposerFocus('c1');
    expect(consumeComposerFocus('c2')).toBe(false); // wrong conversation: no focus
    expect(consumeComposerFocus('c1')).toBe(true); // still pending for its own conversation
  });
  it('a later request replaces an earlier pending one', () => {
    requestComposerFocus('c1');
    requestComposerFocus('c2');
    expect(consumeComposerFocus('c1')).toBe(false);
    expect(consumeComposerFocus('c2')).toBe(true);
  });
});
