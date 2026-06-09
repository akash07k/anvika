import { mkdir, unlink } from 'node:fs/promises';

import { getFileSink } from '@logtape/file';
import { configure, getConsoleSink } from '@logtape/logtape';

import type { LogLevel, LogThreshold } from '@anvika/shared/log-entry';

import { sessionLogPaths } from './retention';
import { createConsoleFormatter, createFileFormatter } from './pretty-formatter';

/** Input to {@link configureLogging}. */
export interface ConfigureLoggingInput {
  /** Absolute path to the application data directory; logs go in `<dataDir>/logs/`. */
  dataDir: string;
  /** Lowest threshold emitted; a level, or `'off'` for entirely off (fatal included). */
  level: LogThreshold;
  /** Per-category threshold overrides (dotted category under anvika, e.g. `server.persistence`). */
  categories: Record<string, LogThreshold>;
  /** Local `YYYY-MM-DD` date stamp for the session's date directory (injected for determinism). */
  dateStamp: string;
  /** Local `HH-MM-SS` time stamp for the session file name (injected for determinism). */
  timeStamp: string;
  /** The process id, suffixed onto the session file name so same-second starts never collide. */
  pid: number;
  /**
   * Whether the console sink shows the `- [category]` segment (the "auto" rule, spec
   * section 15). The file sinks always show it; the console hides it unless debugging.
   */
  debug: boolean;
}

/** One LogTape logger config entry. `parentSinks: 'override'` drops inherited ancestor sinks. */
interface LoggerEntry {
  category: string[];
  lowestLevel: LogLevel;
  sinks: string[];
  parentSinks?: 'inherit' | 'override';
}

/** The app sinks every non-off `anvika` logger writes to. */
const APP_SINKS = ['console', 'file', 'latest'];

/**
 * Build one logger entry for a category at a threshold. A normal level keeps its `lowestLevel` and
 * the app sinks. `'off'` means TRULY off (fatal included): emit no sinks AND `parentSinks:
 * 'override'`, because LogTape sinks otherwise inherit from ancestor loggers, so an empty sink list
 * alone would still log via the base `anvika` sinks.
 */
function loggerFor(category: string[], threshold: LogThreshold, sinks: string[]): LoggerEntry {
  if (threshold === 'off') {
    return { category, lowestLevel: 'trace', sinks: [], parentSinks: 'override' };
  }
  return { category, lowestLevel: threshold, sinks };
}

/**
 * Build the LogTape `loggers` config: the base `anvika` tree at `level`, the `logtape.meta` guard,
 * and one extra entry per category override (its dotted path resolved under `anvika`). A threshold
 * of `'off'` is mapped to no-sinks-with-override so the scope emits nothing at all, fatal included
 * (crash visibility is handled out-of-band by the global error sinks, not by this filter).
 *
 * @param level - The global lowest threshold for the `anvika` tree.
 * @param categories - Dotted-category to threshold overrides.
 * @returns The `loggers` array for `configure`.
 */
export function buildLoggers(
  level: LogThreshold,
  categories: Record<string, LogThreshold>,
): LoggerEntry[] {
  const overrides = Object.entries(categories).map(([dotted, threshold]) =>
    loggerFor(['anvika', ...dotted.split('.')], threshold, APP_SINKS),
  );
  return [
    loggerFor(['anvika'], level, APP_SINKS),
    { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console'] },
    ...overrides,
  ];
}

/**
 * Configure LogTape with the Walnut-style pretty formatters: a console sink, a
 * per-session file sink at `<dataDir>/logs/<date>/<time>-<pid>.log`, and a `latest.log` mirror
 * recreated each start. Each entry reads `LEVEL: <message> - [category] | <timestamp> { <data> }`
 * followed by a blank line for screen-reader navigation. The console hides the category unless
 * `input.debug` is set; the file sinks always show it.
 *
 * Privacy: callers must never pass prompt/output text or API keys as log data.
 * The date directory is created if missing; `latest.log` is unlinked (best-effort) then recreated
 * so it always mirrors the current run.
 *
 * @param input - Logging configuration parameters.
 */
export async function configureLogging(input: ConfigureLoggingInput): Promise<void> {
  const paths = sessionLogPaths({
    dataDir: input.dataDir,
    dateStamp: input.dateStamp,
    timeStamp: input.timeStamp,
    pid: input.pid,
  });
  await mkdir(paths.dir, { recursive: true });
  await unlink(paths.latestFile).catch(() => {});
  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: createConsoleFormatter({ showCategory: input.debug }),
      }),
      file: getFileSink(paths.sessionFile, { formatter: createFileFormatter() }),
      latest: getFileSink(paths.latestFile, { formatter: createFileFormatter() }),
    },
    loggers: buildLoggers(input.level, input.categories),
  });
}
