import { describe, expect, it } from 'vitest';

import { ApiErrorCodeSchema, ApiErrorSchema, API_ERROR_CODES, makeApiError } from './errors';

describe('ApiError contract', () => {
  it('accepts a well-formed error', () => {
    const parsed = ApiErrorSchema.parse({ code: 'not-found', message: 'missing' });
    expect(parsed.code).toBe('not-found');
  });

  it('rejects an unknown code', () => {
    expect(() => ApiErrorSchema.parse({ code: 'bogus', message: 'x' })).toThrow();
  });

  it('makeApiError builds a typed error object', () => {
    const err = makeApiError('unconfigured', 'No model selected', { hint: 'open settings' });
    expect(err).toEqual({
      code: 'unconfigured',
      message: 'No model selected',
      details: { hint: 'open settings' },
    });
  });

  it('exposes the full code list', () => {
    expect(API_ERROR_CODES).toContain('provider-error');
    expect(API_ERROR_CODES).toContain('internal');
  });

  it('accepts the settings-file-invalid code', () => {
    expect(ApiErrorSchema.parse({ code: 'settings-file-invalid', message: 'x' }).code).toBe(
      'settings-file-invalid',
    );
  });
});

describe('ApiErrorCodeSchema fx-refresh-failed', () => {
  it('accepts the fx-refresh-failed code', () => {
    expect(ApiErrorCodeSchema.parse('fx-refresh-failed')).toBe('fx-refresh-failed');
  });
});

describe('ApiErrorCodeSchema conflict', () => {
  it('accepts the conflict code', () => {
    expect(ApiErrorCodeSchema.safeParse('conflict').success).toBe(true);
  });

  it('API_ERROR_CODES includes conflict', () => {
    expect(API_ERROR_CODES).toContain('conflict');
  });

  it('makeApiError builds a conflict error', () => {
    expect(makeApiError('conflict', 'Conversation changed elsewhere')).toEqual({
      code: 'conflict',
      message: 'Conversation changed elsewhere',
    });
  });
});
