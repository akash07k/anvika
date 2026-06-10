import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';

import { safeChatErrorMessage } from './error-message';

/** Build an APICallError with the given status and a sensitive message that must never leak. */
function apiError(statusCode?: number) {
  return new APICallError({
    message: 'secret upstream detail',
    url: 'https://provider.example',
    requestBodyValues: {},
    ...(statusCode !== undefined ? { statusCode } : {}),
  });
}

describe('safeChatErrorMessage', () => {
  it('maps an APICallError to the provider category, never the raw cause', () => {
    const msg = safeChatErrorMessage(apiError());
    expect(msg).toContain('provider');
    expect(msg).not.toContain('secret upstream detail');
  });

  it('maps auth/permission statuses (401/403) to a key-and-access category', () => {
    for (const status of [401, 403]) {
      const msg = safeChatErrorMessage(apiError(status));
      expect(msg).toMatch(/authentication or permissions/i);
      expect(msg).not.toContain('secret upstream detail');
    }
  });

  it('maps 404 to a model/deployment-not-found category', () => {
    expect(safeChatErrorMessage(apiError(404))).toMatch(/model or deployment/i);
  });

  it('maps 429 to a rate-limit category', () => {
    expect(safeChatErrorMessage(apiError(429))).toMatch(/rate-limited/i);
  });

  it('maps 5xx to a transient server-error category carrying the status', () => {
    expect(safeChatErrorMessage(apiError(503))).toContain('HTTP 503');
  });

  it('maps an other 4xx to a rejected category carrying the status and a log pointer', () => {
    const msg = safeChatErrorMessage(apiError(400));
    expect(msg).toContain('HTTP 400');
    expect(msg).toMatch(/server log/i);
    expect(msg).not.toContain('secret upstream detail');
  });

  it('unwraps a wrapped RetryError to map the underlying status (429 to rate-limit)', () => {
    const retry = {
      name: 'AI_RetryError',
      message: 'Failed after 3 attempts. Last error: Error',
      lastError: { name: 'APICallError', message: 'rate limited', statusCode: 429 },
    };
    expect(safeChatErrorMessage(retry)).toMatch(/rate-limited/i);
  });

  it('maps any other value to the default category (total function)', () => {
    expect(safeChatErrorMessage(new Error('weird'))).toContain('failed');
    expect(safeChatErrorMessage('not even an error')).toContain('failed');
    expect(safeChatErrorMessage(undefined)).toContain('failed');
  });

  it('appends the thinking-params hint on a 400 when local thinking params were sent', () => {
    const err = new APICallError({
      message: 'unknown field',
      statusCode: 400,
      url: 'u',
      requestBodyValues: {},
    });
    const msg = safeChatErrorMessage(err, true);
    // The hint is APPENDED to the base 400 category, never replacing it.
    expect(msg).toContain('HTTP 400');
    expect(msg).toContain('extended thinking parameters');
    expect(msg).toContain('Settings');
  });

  it('does not append the hint on a 400 when no local thinking params were sent', () => {
    const err = new APICallError({
      message: 'bad',
      statusCode: 400,
      url: 'u',
      requestBodyValues: {},
    });
    expect(safeChatErrorMessage(err, false)).not.toContain('extended thinking parameters');
  });

  it('defaults the flag to false (back-compatible single-arg call)', () => {
    const err = new APICallError({
      message: 'bad',
      statusCode: 400,
      url: 'u',
      requestBodyValues: {},
    });
    expect(safeChatErrorMessage(err)).not.toContain('extended thinking parameters');
  });
});
