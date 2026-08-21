import { configure, type LogRecord } from '@logtape/logtape';

import type { LogLevel } from '@anvika/shared/log-entry';

const LOG_LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  trace: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
  fatal: 5,
};

interface ActiveCapture {
  records: LogRecord[];
  level: LogLevel;
}

interface CaptureState {
  configured: boolean;
  configuring: Promise<void> | undefined;
  active: ActiveCapture | undefined;
}

declare global {
  var anvikaServerLogCaptureState: CaptureState | undefined;
}

function captureState(): CaptureState {
  globalThis.anvikaServerLogCaptureState ??= {
    configured: false,
    configuring: undefined,
    active: undefined,
  };
  return globalThis.anvikaServerLogCaptureState;
}

function captureSink(record: LogRecord): void {
  const active = captureState().active;
  if (!active) return;
  const lowestLevel =
    record.category[0] === 'logtape' && record.category[1] === 'meta' ? 'warning' : active.level;
  if (LOG_LEVEL_ORDER[record.level] < LOG_LEVEL_ORDER[lowestLevel]) return;
  active.records.push(record);
}

async function configureCaptureSink(): Promise<void> {
  const state = captureState();
  if (state.configured) return;
  state.configuring ??= configure({
    reset: true,
    sinks: { buffer: captureSink },
    loggers: [
      { category: ['anvika'], lowestLevel: 'trace', sinks: ['buffer'] },
      { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['buffer'] },
    ],
  })
    .then(() => {
      state.configured = true;
    })
    .finally(() => {
      state.configuring = undefined;
    });
  await state.configuring;
}

/** Options for {@link captureServerLogs}. */
export interface CaptureServerLogsOptions {
  /** Lowest level captured on the `anvika` tree; defaults to `'info'`. */
  level?: LogLevel;
}

/** A live log capture: the growing record array and an async teardown that releases it. */
export interface ServerLogCapture {
  /** The captured records, in emission order; assert against this after the code under test runs. */
  records: LogRecord[];
  /** Release this capture buffer. Call once in `afterEach`. */
  teardown: () => Promise<void>;
}

/**
 * Capture Server logs through one in-memory sink per test runtime. Reusing the configured sink
 * avoids LogTape registering a process exit listener for every test capture. This helper owns the
 * LogTape configuration for tests that use it. Tests assert on `records` after exercising the code
 * under test, then release the capture in `afterEach`.
 *
 * @param options - Optional capture floor (defaults to `'info'`).
 * @returns The live {@link ServerLogCapture}.
 */
export async function captureServerLogs(
  options: CaptureServerLogsOptions = {},
): Promise<ServerLogCapture> {
  await configureCaptureSink();
  const state = captureState();
  if (state.active) {
    throw new Error('A server log capture is already active; release it before creating another.');
  }
  const records: LogRecord[] = [];
  const active: ActiveCapture = { records, level: options.level ?? 'info' };
  state.active = active;
  return {
    records,
    teardown: async () => {
      if (captureState().active === active) captureState().active = undefined;
    },
  };
}
