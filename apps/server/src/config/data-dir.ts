import { accessSync, constants, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Input for {@link resolveDataDir}, specifying candidate paths by precedence. */
export interface ResolveDataDirInput {
  /** Highest precedence: an explicit --data-dir flag value. */
  flag?: string | undefined;
  /** Next: the ANVIKA_DATA_DIR environment variable value. */
  env?: string | undefined;
  /** Lowest precedence: the built-in default location. */
  defaultDir: string;
}

/**
 * Resolve the application data directory by precedence (flag, then env, then default),
 * create it and its `logs/` subdirectory, and verify it is writable.
 *
 * @param input - The flag, env, and default candidate values.
 * @returns The absolute resolved data directory path.
 * @throws If the resolved directory cannot be created or is not writable.
 */
export function resolveDataDir(input: ResolveDataDirInput): string {
  const chosen = input.flag ?? input.env ?? input.defaultDir;
  const dir = resolve(chosen);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'logs'), { recursive: true });
  try {
    accessSync(dir, constants.W_OK);
  } catch {
    throw new Error(
      `Anvika data directory is not writable: ${dir}. Pass --data-dir <path> or set ANVIKA_DATA_DIR to a writable location.`,
    );
  }
  return dir;
}
