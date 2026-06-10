import { afterEach, describe, expect, it, vi } from 'vitest';

const { logDiag } = vi.hoisted(() => ({ logDiag: vi.fn() }));
vi.mock('./logDiag', () => ({ logDiag }));

import { installWindowErrorHandlers } from './window-errors';

let stop: (() => void) | undefined;

/** No-op error absorber used to prevent jsdom from re-throwing an ErrorEvent as an uncaught
 *  exception when no error handler is registered at the time of dispatch. */
function absorb(e: ErrorEvent): void {
  e.preventDefault();
}

afterEach(() => {
  if (stop) stop();
  stop = undefined;
  logDiag.mockClear();
});

describe('installWindowErrorHandlers', () => {
  it('maps an ErrorEvent to a content-safe clientError (name + location, no message)', () => {
    stop = installWindowErrorHandlers();
    const event = new ErrorEvent('error', {
      error: new TypeError('secret detail'),
      filename: 'app.js',
      lineno: 12,
      colno: 5,
    });
    window.dispatchEvent(event);
    expect(logDiag).toHaveBeenCalledWith({
      type: 'clientError',
      name: 'TypeError',
      source: 'app.js',
      line: 12,
      col: 5,
    });
  });

  it('maps an unhandledrejection to a clientError using the reason name', () => {
    stop = installWindowErrorHandlers();
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(event, 'reason', { value: new RangeError('x'), configurable: true });
    window.dispatchEvent(event);
    expect(logDiag).toHaveBeenCalledWith({ type: 'clientError', name: 'RangeError' });
  });

  it('falls back to a generic name when no error object is present', () => {
    stop = installWindowErrorHandlers();
    window.dispatchEvent(new ErrorEvent('error', { filename: 'a.js', lineno: 1, colno: 1 }));
    expect(logDiag).toHaveBeenCalledWith({
      type: 'clientError',
      name: 'Error',
      source: 'a.js',
      line: 1,
      col: 1,
    });
  });

  it('stop() removes the listeners', () => {
    stop = installWindowErrorHandlers();
    stop();
    stop = undefined;
    // Add the no-op absorber to prevent jsdom from re-throwing the ErrorEvent as an
    // uncaught exception when no other error handler is registered.
    window.addEventListener('error', absorb);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('y') }));
    window.removeEventListener('error', absorb);
    expect(logDiag).not.toHaveBeenCalled();
  });
});
