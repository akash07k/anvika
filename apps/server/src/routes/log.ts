import { Hono } from 'hono';

import { DiagnosticBatchSchema } from '@anvika/shared/diagnostics/events';
import { makeApiError } from '@anvika/shared/errors';
import type { LogLevel } from '@anvika/shared/log-entry';

import { clientLogger } from '../logging/logger';
import { diagnosticLogCalls } from './diag-log-entries';

/** Write a single resolved diagnostic call at its level (LogTape filters by category config). */
function writeCall(
  category: readonly string[],
  level: LogLevel,
  message: string,
  fields: Record<string, unknown>,
): void {
  const logger = clientLogger(...category);
  switch (level) {
    case 'trace':
      logger.trace(message, fields);
      break;
    case 'debug':
      logger.debug(message, fields);
      break;
    case 'info':
      logger.info(message, fields);
      break;
    case 'warning':
      logger.warn(message, fields);
      break;
    case 'error':
      logger.error(message, fields);
      break;
    case 'fatal':
      logger.fatal(message, fields);
      break;
  }
}

/** Options for {@link createLogRoute}. */
export interface CreateLogRouteInput {
  /** Whether the resolved global log level is `off`; when true, signal the client to go silent. */
  globalLogOff: boolean;
  /** Whether content logging is enabled; gates milestone text in the persisted log. */
  logContent: boolean;
}

/**
 * Build the single client logging endpoint. Accepts a bounded, typed batch of content-safe
 * diagnostic entries and records each under a server-controlled `anvika.client.*` category at a
 * registry-decided level. No free-form field is accepted, so prompt/response text and secrets can
 * never be persisted. An invalid or oversized batch is rejected whole; nothing is written. When
 * `globalLogOff` is set, the 204 carries `x-anvika-diagnostics: off` so the client stops POSTing.
 *
 * @param input - Whether the global level is `off`.
 * @returns A {@link Hono} app exposing `POST /api/v1/log`.
 */
export function createLogRoute(input: CreateLogRouteInput) {
  return new Hono().post('/api/v1/log', async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = DiagnosticBatchSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(makeApiError('validation-error', 'Invalid log batch'), 400);
    }
    for (const call of diagnosticLogCalls(parsed.data, { logContent: input.logContent })) {
      writeCall(call.category, call.level, call.message, call.fields);
    }
    if (input.globalLogOff) {
      c.header('x-anvika-diagnostics', 'off');
    }
    return c.body(null, 204);
  });
}
