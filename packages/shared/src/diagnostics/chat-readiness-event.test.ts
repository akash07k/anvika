import { describe, expect, it } from 'vitest';

import { DiagnosticEventSchema } from './events';

describe('chatReadinessResolved diagnostic event', () => {
  it('accepts each readiness state', () => {
    for (const state of ['unconfigured', 'model-unavailable', 'ready'] as const) {
      expect(
        DiagnosticEventSchema.safeParse({ type: 'chatReadinessResolved', state }).success,
      ).toBe(true);
    }
  });

  it('rejects an unknown state and any extra field', () => {
    expect(
      DiagnosticEventSchema.safeParse({ type: 'chatReadinessResolved', state: 'loading' }).success,
    ).toBe(false);
    expect(
      DiagnosticEventSchema.safeParse({ type: 'chatReadinessResolved', state: 'ready', extra: 1 })
        .success,
    ).toBe(false);
  });
});
