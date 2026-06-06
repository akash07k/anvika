import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Codes Windows raises when antivirus / the Search Indexer briefly locks a file. */
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 20;

let tmpCounter = 0;

/** The shape of `node:fs/promises`' `rename`, narrowed to what {@link writeFileAtomic} calls. */
export type RenameFn = (from: string, to: string) => Promise<void>;

/** Options for {@link writeFileAtomic}. */
export interface AtomicWriteOptions {
  /** POSIX file mode for the final file (best-effort; a no-op on Windows). */
  mode?: number;
  /**
   * The `rename` implementation, defaulting to `node:fs/promises`' `rename`. Injectable only so a
   * test can exercise the transient-lock retry path deterministically (mocking `node:fs/promises`
   * itself hangs the bun test runner); production never passes this.
   */
  rename?: RenameFn;
}

/** Resolve after `ms` milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write `data` to `path` atomically: write a sibling temp file, then `rename` over the target
 * (atomic on POSIX; MoveFileEx replace on Windows). Retries `rename` a few times with a small
 * backoff on transient Windows lock errors (`EPERM`/`EBUSY`/`EACCES`). On give-up the temp file
 * is removed and the error re-raised. `Bun.write` is intentionally NOT used (it is not atomic).
 *
 * @param path - The destination file path.
 * @param data - The file contents.
 * @param options - Optional POSIX `mode` for the final file and an injectable `rename` (tests only).
 */
export async function writeFileAtomic(
  path: string,
  data: string,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const renameFn = options.rename ?? rename;
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${tmpCounter++}.tmp`;
  await writeFile(tmp, data, options.mode !== undefined ? { mode: options.mode } : undefined);
  if (options.mode !== undefined) {
    await chmod(tmp, options.mode).catch(() => undefined); // belt-and-suspenders; no-op on Windows
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await renameFn(tmp, path);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (attempt < MAX_ATTEMPTS && code !== undefined && RETRY_CODES.has(code)) {
        await delay(BASE_BACKOFF_MS * attempt);
        continue;
      }
      await rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}
