import type { Context, MiddlewareHandler, Next } from 'hono';

import { serverLogger } from '../logging/logger';

/**
 * A single request log entry: HTTP method, path, response status, and duration. Declared
 * as a type alias (not an interface) so it is assignable to the logger's
 * `Record<string, unknown>` properties parameter.
 */
export type RequestLogEntry = {
  /** The HTTP method (e.g. `GET`, `POST`). */
  method: string;
  /** The request path (no query string). */
  path: string;
  /** The response status code. */
  status: number;
  /** Wall-clock time from entering the middleware to the handler returning, in ms. */
  durationMs: number;
};

/** Emit a single request log entry. */
export type RequestLogSink = (entry: RequestLogEntry) => void;

/** Default sink: the LogTape `http` category at info level. */
function defaultSink(entry: RequestLogEntry): void {
  serverLogger('http').info('request', entry);
}

/**
 * Create a Hono middleware that logs each matched request once it completes: method, path,
 * response status, and duration. It never logs request or response bodies, so prompt and
 * response text stay out of the logs (privacy rule). The sink is injectable for tests.
 *
 * @param sink - Where to emit each entry; defaults to the LogTape `http` logger.
 * @returns A Hono middleware handler.
 */
export function createRequestLogging(sink: RequestLogSink = defaultSink): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<void> => {
    const start = Date.now();
    await next();
    sink({
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  };
}
