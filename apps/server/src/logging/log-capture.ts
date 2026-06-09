import { configure, reset, type LogRecord } from '@logtape/logtape';

import type { LogLevel } from '@anvika/shared/log-entry';

/** Options for {@link captureServerLogs}. */
export interface CaptureServerLogsOptions {
  /** Lowest level captured on the `anvika` tree; defaults to `'info'`. */
  level?: LogLevel;
}

/** A live log capture: the growing record array and an async teardown that resets LogTape. */
export interface ServerLogCapture {
  /** The captured records, in emission order; assert against this after the code under test runs. */
  records: LogRecord[];
  /** Reset LogTape configuration and detach the buffer sink. Call once in `afterEach`. */
  teardown: () => Promise<void>;
}

/**
 * Install a memory buffer sink over the whole `anvika` tree for tests, using the documented
 * LogTape buffer-sink pattern. Returns the captured {@link LogRecord} array and an async teardown
 * that calls `reset()`. Tests assert on `records` after exercising the code under test. The base
 * logger and the `logtape.meta` guard are configured so a sink exception is visible in tests.
 *
 * @param options - Optional capture floor (defaults to `'info'`).
 * @returns The live {@link ServerLogCapture}.
 */
export async function captureServerLogs(
  options: CaptureServerLogsOptions = {},
): Promise<ServerLogCapture> {
  const records: LogRecord[] = [];
  await configure({
    reset: true,
    sinks: { buffer: records.push.bind(records) },
    loggers: [
      { category: ['anvika'], lowestLevel: options.level ?? 'info', sinks: ['buffer'] },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['buffer'] },
    ],
  });
  return { records, teardown: () => reset() };
}
