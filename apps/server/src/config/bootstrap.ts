import { LOG_THRESHOLDS, type LogThreshold } from '@anvika/shared/log-entry';

/** Default port the server listens on. */
export const DEFAULT_PORT = 7800;

/** Default data directory name, relative to the application root. */
export const DEFAULT_DATA_DIR = 'userdata';

/** CLI flags accepted by the serve command. */
export interface BootstrapFlags {
  /** Raw, unparsed TCP port string from --port; parsed and validated here, overrides env and default. */
  port?: string | undefined;
  /** Explicit data directory path from --data-dir flag, overrides env and default. */
  dataDir?: string | undefined;
  /** Whether to open the browser on startup; --no-open sets this to false. */
  open?: boolean | undefined;
  /** Whether to log message content; --log-content sets this true (development only). */
  logContent?: boolean | undefined;
  /** Global log level from --log-level (overrides env and the default). */
  logLevel?: string | undefined;
  /** Repeatable per-category overrides from --log-category, each `<cat>=<level>`. */
  logCategory?: string[] | undefined;
}

/** Fully resolved bootstrap configuration derived from flags, env, and defaults. */
export interface BootstrapConfig {
  /** TCP port the server will listen on. */
  port: number;
  /** Whether to open the browser after the server starts. */
  open: boolean;
  /** Raw data directory value from the --data-dir flag, if provided. Resolved later by resolveDataDir. */
  dataDirFlag: string | undefined;
  /** Raw data directory value from the ANVIKA_DATA_DIR env var, if provided. Resolved later by resolveDataDir. */
  dataDirEnv: string | undefined;
  /** Whether to log the user/assistant message text (development opt-in, default off). */
  logContent: boolean;
  /** Resolved log verbosity (global level + per-category overrides). */
  log: LogConfig;
}

/** Input for {@link resolveBootstrapConfig}. */
export interface ResolveBootstrapInput {
  /** Parsed CLI flags. */
  flags: BootstrapFlags;
  /** Process environment variables (pass `process.env` or a test double). */
  env: Record<string, string | undefined>;
}

/** Resolved logging verbosity: a global threshold plus per-category overrides. */
export interface LogConfig {
  /** The global lowest threshold (a level, or `'off'` for entirely off - fatal included). */
  level: LogThreshold;
  /** Map of dotted category (e.g. `server.persistence`) to its overriding threshold. */
  categories: Record<string, LogThreshold>;
}

/** Narrow an arbitrary string to a {@link LogThreshold} (a level or `'off'`), or throw. */
function parseLevel(value: string, source: string): LogThreshold {
  if ((LOG_THRESHOLDS as readonly string[]).includes(value)) return value as LogThreshold;
  throw new Error(`${source} must be one of ${LOG_THRESHOLDS.join(', ')}, got: ${value}`);
}

/** Parse `cat=level` tokens into a validated map, failing fast on a malformed token. */
function parseCategories(tokens: readonly string[], source: string): Record<string, LogThreshold> {
  const out: Record<string, LogThreshold> = {};
  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq <= 0 || eq === token.length - 1) {
      throw new Error(`${source} must be <category>=<level>, got: ${token}`);
    }
    out[token.slice(0, eq)] = parseLevel(token.slice(eq + 1), source);
  }
  return out;
}

/**
 * Resolve logging verbosity from flags and env (precedence flag > env > default `info`). The global
 * level comes from `--log-level` / `ANVIKA_LOG_LEVEL`; per-category overrides come from repeatable
 * `--log-category <cat>=<level>` flags and a comma-separated `ANVIKA_LOG_CATEGORIES`. Invalid input
 * throws so startup fails fast with a clear message rather than silently ignoring it.
 *
 * @param input - Parsed flags and the environment.
 * @returns The resolved {@link LogConfig}.
 */
export function resolveLogConfig(input: ResolveBootstrapInput): LogConfig {
  const flagLevel = input.flags.logLevel;
  const envLevel = input.env['ANVIKA_LOG_LEVEL'];
  const level =
    flagLevel !== undefined
      ? parseLevel(flagLevel, '--log-level')
      : envLevel !== undefined
        ? parseLevel(envLevel, 'ANVIKA_LOG_LEVEL')
        : 'info';

  const envTokens = (input.env['ANVIKA_LOG_CATEGORIES'] ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const categories = {
    ...parseCategories(envTokens, 'ANVIKA_LOG_CATEGORIES'),
    ...parseCategories(input.flags.logCategory ?? [], '--log-category'),
  };
  return { level, categories };
}

/** Lowest valid TCP port. */
const MIN_PORT = 1;
/** Highest valid TCP port. */
const MAX_PORT = 65535;

/**
 * Strictly parse and range-check a port string, throwing a clear error otherwise.
 * The whole string must be digits (no prefixes/suffixes), unlike Number.parseInt.
 * @param value - The candidate port string.
 * @param source - Human-readable origin of the value (for the error message).
 * @returns The validated port number.
 * @throws if the string is not a whole number in the valid port range.
 */
function parsePort(value: string, source: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${source} must be a whole number (no extra characters), got: ${value}`);
  }
  const port = Number.parseInt(value, 10);
  if (port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `${source} must be a valid port number (${MIN_PORT}-${MAX_PORT}), got: ${value}`,
    );
  }
  return port;
}

/**
 * Interpret an environment value as a boolean opt-in: true only for `1` or `true`
 * (case-insensitive, trimmed); everything else - including undefined - is false.
 *
 * @param value - The raw environment value.
 * @returns Whether the value opts in.
 */
function isEnvTrue(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}

/**
 * Build the bootstrap config from CLI flags and environment variables,
 * with precedence flag > env > default for each setting. The port (from
 * --port or ANVIKA_PORT) is validated; an invalid value fails fast rather
 * than silently binding a random port.
 *
 * @param input - Parsed CLI flags and environment variables.
 * @returns The fully resolved {@link BootstrapConfig}.
 * @throws if --port or ANVIKA_PORT is not a valid port number.
 */
export function resolveBootstrapConfig(input: ResolveBootstrapInput): BootstrapConfig {
  const envPort = input.env['ANVIKA_PORT'];
  let port: number;
  if (input.flags.port !== undefined) {
    port = parsePort(input.flags.port, '--port');
  } else if (envPort !== undefined) {
    port = parsePort(envPort, 'ANVIKA_PORT');
  } else {
    port = DEFAULT_PORT;
  }
  return {
    port,
    open: input.flags.open ?? true,
    dataDirFlag: input.flags.dataDir,
    dataDirEnv: input.env['ANVIKA_DATA_DIR'],
    logContent: input.flags.logContent ?? isEnvTrue(input.env['ANVIKA_LOG_CONTENT']),
    log: resolveLogConfig(input),
  };
}
