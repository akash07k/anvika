import type { DiagnosticEvent } from '@anvika/shared/diagnostics/events';

import { logDiag } from './logDiag';

/** Largest accepted error-name length, mirroring the shared `clientError.name` bound. */
const MAX_NAME = 120;

/** Bound a value to a non-empty, length-capped error class name, defaulting to `'Error'`. */
function boundName(value: unknown): string {
  const name = typeof value === 'string' && value.length > 0 ? value : 'Error';
  return name.slice(0, MAX_NAME);
}

/** Build the content-safe `clientError` event from an `ErrorEvent` (name + bounded location). */
function fromErrorEvent(event: ErrorEvent): DiagnosticEvent {
  const base: DiagnosticEvent = {
    type: 'clientError',
    name: boundName(event.error instanceof Error ? event.error.name : undefined),
  };
  return {
    ...base,
    ...(event.filename ? { source: event.filename.slice(0, 80) } : {}),
    ...(typeof event.lineno === 'number' ? { line: Math.max(0, event.lineno) } : {}),
    ...(typeof event.colno === 'number' ? { col: Math.max(0, event.colno) } : {}),
  };
}

/** Build the content-safe `clientError` event from a rejection reason's name only. */
function fromRejection(event: PromiseRejectionEvent): DiagnosticEvent {
  const reason: unknown = event.reason;
  return {
    type: 'clientError',
    name: boundName(reason instanceof Error ? reason.name : undefined),
  };
}

/**
 * Install `window` `error` and `unhandledrejection` listeners that forward a content-safe
 * `clientError` diagnostic (error CLASS name plus a bounded source/line/col) over the existing
 * `logDiag` pipe - never the error message text, so no content crosses the boundary. Wire once at
 * app startup.
 *
 * @returns A stop function that removes both listeners.
 */
export function installWindowErrorHandlers(): () => void {
  const onError = (event: ErrorEvent): void => {
    logDiag(fromErrorEvent(event));
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    logDiag(fromRejection(event));
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
