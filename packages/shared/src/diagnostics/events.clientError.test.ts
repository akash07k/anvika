import { describe, expect, it } from 'vitest';

import { DiagnosticEventSchema } from './events';

describe('clientError variant', () => {
  it('accepts a clientError with only the required name', () => {
    const parsed = DiagnosticEventSchema.parse({ type: 'clientError', name: 'TypeError' });
    expect(parsed.type).toBe('clientError');
  });

  it('accepts a clientError with optional source/line/col', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'clientError',
      name: 'Error',
      source: 'app.js',
      line: 12,
      col: 3,
    });
    expect(parsed.type).toBe('clientError');
  });

  it('rejects a clientError carrying a free-form message field (content-safety)', () => {
    expect(() =>
      DiagnosticEventSchema.parse({ type: 'clientError', name: 'Error', message: 'leaked text' }),
    ).toThrow();
  });

  it('accepts a clientError carrying the optional bounded requestId', () => {
    const parsed = DiagnosticEventSchema.parse({
      type: 'clientError',
      name: 'Error',
      requestId: '1a2b3c4d',
    });
    expect(parsed.type).toBe('clientError');
    expect((parsed as { requestId?: string }).requestId).toBe('1a2b3c4d');
  });

  it('rejects an over-long requestId (bounded, content-free)', () => {
    expect(() =>
      DiagnosticEventSchema.parse({
        type: 'clientError',
        name: 'Error',
        requestId: 'x'.repeat(65),
      }),
    ).toThrow();
  });
});
