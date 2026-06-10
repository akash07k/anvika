import { describe, expect, it } from 'vitest';

import { errorCauseDetail } from './error-cause';

describe('errorCauseDetail', () => {
  it('returns undefined for an error with no wrapped cause', () => {
    expect(errorCauseDetail(new Error('plain'))).toBeUndefined();
    expect(errorCauseDetail('not an error')).toBeUndefined();
    expect(errorCauseDetail(undefined)).toBeUndefined();
  });

  it('unwraps a RetryError-style lastError to the underlying provider failure', () => {
    const retry = {
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts. Last error: Error',
      lastError: { name: 'APICallError', message: 'model not found', statusCode: 404 },
    };
    expect(errorCauseDetail(retry)).toEqual({
      name: 'APICallError',
      message: 'model not found',
      statusCode: 404,
    });
  });

  it('follows the standard `cause` chain to the deepest error', () => {
    const wrapped = { name: 'Wrapper', cause: { name: 'TypeError', message: 'fetch failed' } };
    expect(errorCauseDetail(wrapped)).toEqual({ name: 'TypeError', message: 'fetch failed' });
  });

  it('truncates a long underlying message to keep the log line bounded', () => {
    const long = 'x'.repeat(1000);
    const detail = errorCauseDetail({ name: 'Outer', cause: { message: long } });
    expect(detail?.message?.length).toBe(300);
  });

  it('does not loop forever on a cyclic cause chain', () => {
    const a: Record<string, unknown> = { name: 'A' };
    const b: Record<string, unknown> = { name: 'B', cause: a };
    a['cause'] = b;
    // Bounded descent returns some detail without hanging.
    expect(errorCauseDetail(a)).toBeDefined();
  });
});
