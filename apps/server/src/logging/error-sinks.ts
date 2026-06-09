import { serverLogger } from './logger';

/** Injectable side effects so the handlers are testable without killing the process. */
export interface ProcessErrorHandlerDeps {
  /** Terminate the process; defaults to `process.exit`. */
  exit?: (code: number) => void;
  /** Write a line to standard error; defaults to `process.stderr.write`. */
  writeStderr?: (line: string) => void;
}

/** The two process-error handler functions. */
export interface ProcessErrorHandlers {
  /** Handle an unhandled promise rejection: log + stderr, no exit. */
  onRejection: (reason: unknown) => void;
  /** Handle an uncaught exception: log fatal + stderr, then exit non-zero. */
  onException: (err: unknown) => void;
}

/** Render an error's stack (or its string form) for the always-on stderr crash line. */
function crashDetail(err: unknown): string {
  return err instanceof Error ? (err.stack ?? String(err)) : String(err);
}

/**
 * Build the process-error handlers. Both log a content-safe line under `anvika.server.process`
 * (`{ message: String(err) }` only - the error's own message string, never prompt/response content
 * or secrets) AND write to stderr, which is the
 * always-on crash channel that stays visible even at `--log-level off`. `onException` then exits
 * non-zero (an uncaught exception leaves the process in an undefined state - the conventional
 * response is to crash); `onRejection` does not exit (a stray rejection must not kill a local
 * single-user server). `exit`/`writeStderr` are injected so tests can assert them without
 * terminating the runner.
 *
 * @param deps - Optional `exit` / `writeStderr` overrides (default to the real process effects).
 * @returns The {@link ProcessErrorHandlers}.
 */
export function createProcessErrorHandlers(
  deps: ProcessErrorHandlerDeps = {},
): ProcessErrorHandlers {
  const exit = deps.exit ?? ((code: number): void => void process.exit(code));
  const writeStderr = deps.writeStderr ?? ((line: string): void => void process.stderr.write(line));
  const log = serverLogger('process');
  return {
    onRejection: (reason: unknown): void => {
      log.error('unhandled promise rejection', { message: String(reason) });
      writeStderr(`anvika: unhandled promise rejection: ${crashDetail(reason)}\n`);
    },
    onException: (err: unknown): void => {
      log.fatal('uncaught exception', { message: String(err) });
      writeStderr(`anvika: uncaught exception: ${crashDetail(err)}\n`);
      exit(1);
    },
  };
}

/**
 * Register the process-error handlers on `process` so nothing fails silently. Call once in
 * `startServer` AFTER `configureLogging`.
 *
 * @param deps - Optional side-effect overrides forwarded to {@link createProcessErrorHandlers}.
 * @returns A teardown that removes the registered listeners (used by tests).
 */
export function installProcessErrorHandlers(deps?: ProcessErrorHandlerDeps): () => void {
  const { onRejection, onException } = createProcessErrorHandlers(deps);
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  return () => {
    process.off('unhandledRejection', onRejection);
    process.off('uncaughtException', onException);
  };
}
