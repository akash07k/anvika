import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logDiag', () => ({ logDiag: vi.fn() }));

import { ApiClientError } from '../lib/api-client';
import { logDiag } from './logDiag';
import { clientErrorName, reportClientError } from './reportClientError';

describe('clientErrorName', () => {
  it('uses the server code for an ApiClientError (HTTP failures)', () => {
    expect(clientErrorName(new ApiClientError('unconfigured', 'no model', undefined))).toBe(
      'unconfigured',
    );
  });

  it('uses the class name for a generic error (mid-stream)', () => {
    expect(clientErrorName(new TypeError('x'))).toBe('TypeError');
  });

  it('falls back to "Error" for a non-Error throw', () => {
    expect(clientErrorName('a string')).toBe('Error');
  });
});

describe('reportClientError', () => {
  beforeEach(() => vi.mocked(logDiag).mockClear());

  it('emits a content-safe clientError tagged with the given correlation id', () => {
    reportClientError(new Error('boom'), 'abcd1234');
    expect(logDiag).toHaveBeenCalledWith({
      type: 'clientError',
      name: 'Error',
      requestId: 'abcd1234',
    });
    // Privacy: the raw message never crosses into the diagnostic.
    expect(JSON.stringify(vi.mocked(logDiag).mock.calls)).not.toContain('boom');
  });

  it('omits requestId when the id is empty (no turn id available)', () => {
    reportClientError(new Error('x'), '');
    expect(logDiag).toHaveBeenCalledWith({ type: 'clientError', name: 'Error' });
  });
});
