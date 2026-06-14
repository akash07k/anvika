import { describe, expect, it } from 'vitest';

import { enrich, snapshotMeta } from './enrich';

describe('enrich', () => {
  it('returns a complete live-list override verbatim (no base fetch)', async () => {
    const meta = await enrich('openai-compatible', 'llama-3.3-70b', {
      override: { inputPrice: 1, outputPrice: 2, contextWindow: 1000, maxOutputTokens: 100 },
      fetchImpl: async () => new Response('{}', { status: 500 }),
    });
    expect(meta).toEqual({
      inputPrice: 1,
      outputPrice: 2,
      contextWindow: 1000,
      maxOutputTokens: 100,
    });
  });

  it("fills an override's null fields from the base (models.dev/snapshot)", async () => {
    // The override carries price but not context; with models.dev unavailable and no snapshot row,
    // the null fields fall through to null while the override's non-null fields win.
    const meta = await enrich('openai-compatible', 'totally-unknown', {
      override: { inputPrice: 5, outputPrice: 9, contextWindow: null, maxOutputTokens: null },
      fetchImpl: async () => new Response('{}', { status: 500 }),
    });
    expect(meta).toEqual({
      inputPrice: 5,
      outputPrice: 9,
      contextWindow: null,
      maxOutputTokens: null,
    });
  });

  it('merges a partial override over a non-null SNAPSHOT base (override wins; nulls fill from base)', async () => {
    const base = snapshotMeta('anthropic', 'claude-haiku-4-5');
    expect(base).not.toBeNull(); // guard: the chosen id must exist in the snapshot
    const meta = await enrich('anthropic', 'claude-haiku-4-5', {
      override: { inputPrice: 99, outputPrice: null, contextWindow: null, maxOutputTokens: 7 },
      fetchImpl: async () => new Response('{}', { status: 500 }), // models.dev down -> snapshot base
    });
    expect(meta.inputPrice).toBe(99); // override non-null wins
    expect(meta.maxOutputTokens).toBe(7); // override non-null wins
    expect(meta.outputPrice).toBe(base?.outputPrice); // override null -> filled from snapshot base
    expect(meta.contextWindow).toBe(base?.contextWindow); // override null -> filled from snapshot base
  });

  it('falls through to null when nothing has metadata (no override)', async () => {
    const meta = await enrich('openai-compatible', 'totally-unknown', {
      fetchImpl: async () => new Response('{}', { status: 500 }),
    });
    expect(meta).toEqual({
      inputPrice: null,
      outputPrice: null,
      contextWindow: null,
      maxOutputTokens: null,
    });
  });
});
