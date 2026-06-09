import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Matches a per-day log DIRECTORY name and captures its `YYYY-MM-DD` date. */
const LOG_DIR_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Input to {@link sweepOldLogs}. */
export interface SweepOldLogsInput {
  /** Directory holding per-day `YYYY-MM-DD/` log directories (typically `<dataDir>/logs`). */
  dir: string;
  /** Maximum age, in days, a date directory may reach before it is deleted. */
  retentionDays: number;
  /** The reference "now" instant; the cutoff is `now - retentionDays`. */
  now: Date;
}

/**
 * Format a date as the local `YYYY-MM-DD` stamp embedded in daily log file names. This is the
 * single source of truth for the log-file date and the exact inverse of {@link parseLogDate};
 * both use the LOCAL calendar date so file naming, rotation, and retention always agree
 * (Walnut rotates at local-time midnight). The two functions MUST stay in sync.
 *
 * @param date - The instant whose local calendar date is stamped.
 * @returns The `YYYY-MM-DD` stamp.
 */
export function formatLogDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a date as the colon-free, zero-padded `HH-MM-SS` LOCAL time stamp embedded in a
 * per-session log file name. Colon-free so the name is valid on Windows; LOCAL time to mirror
 * {@link formatLogDateStamp}'s local-calendar approach so the date dir and the time agree.
 *
 * @param date - The instant whose local wall-clock time is stamped.
 * @returns The `HH-MM-SS` stamp.
 */
export function formatLogTimeStamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

/** Input to {@link sessionLogPaths}. */
export interface SessionLogPathsInput {
  /** Absolute application data directory; logs live under `<dataDir>/logs`. */
  dataDir: string;
  /** Local `YYYY-MM-DD` date stamp (from {@link formatLogDateStamp}); names the date directory. */
  dateStamp: string;
  /** Local `HH-MM-SS` time stamp (from {@link formatLogTimeStamp}); part of the session file name. */
  timeStamp: string;
  /** The process id, suffixed so two starts in the same second never collide. */
  pid: number;
}

/** The resolved file paths for one server session: the date dir, its session file, and `latest.log`. */
export interface SessionLogPaths {
  /** The per-day directory `<dataDir>/logs/<dateStamp>`. */
  dir: string;
  /** The permanent per-session archive `<dir>/<timeStamp>-<pid>.log`. */
  sessionFile: string;
  /** The fixed mirror `<dataDir>/logs/latest.log`, recreated each start. */
  latestFile: string;
}

/**
 * Compute the per-session log paths purely (no I/O). One file per server start under a date
 * directory keeps each run self-contained and screen-reader-friendly; `latest.log` is a fixed
 * path the operator can always open.
 *
 * @param input - The data dir and the session's date/time/pid.
 * @returns The {@link SessionLogPaths}.
 */
export function sessionLogPaths(input: SessionLogPathsInput): SessionLogPaths {
  const dir = join(input.dataDir, 'logs', input.dateStamp);
  return {
    dir,
    sessionFile: join(dir, `${input.timeStamp}-${input.pid}.log`),
    latestFile: join(input.dataDir, 'logs', 'latest.log'),
  };
}

/**
 * Parse the date from a per-day log DIRECTORY name to LOCAL midnight, or `undefined` if the name
 * is not a `YYYY-MM-DD` directory (so `latest.log` and other entries are ignored). Exact inverse
 * of {@link formatLogDateStamp}.
 *
 * @param name - A directory entry name.
 * @returns The directory's local-midnight date, or `undefined` for non-matching names.
 */
function parseLogDate(name: string): Date | undefined {
  const match = LOG_DIR_PATTERN.exec(name);
  if (match === null) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/**
 * Delete per-day log DIRECTORIES older than `retentionDays` LOCAL calendar days (the startup
 * sweep; the cutoff is local midnight, DST-stable). Entries not named
 * `YYYY-MM-DD` (including `latest.log` and any stray file) are ignored, so the latest pointer is
 * never swept. A missing directory is tolerated, and one stubborn entry (e.g. a locked dir on
 * Windows: EBUSY/EPERM) is skipped so the whole sweep cannot abort.
 *
 * @param input - Directory, retention window, and reference time.
 * @returns The date-directory names that were deleted.
 */
export async function sweepOldLogs(input: SweepOldLogsInput): Promise<readonly string[]> {
  // Cutoff is local midnight `retentionDays` calendar days before `now`, computed with `setDate`
  // rather than fixed 24h millisecond math: a local day may be 23 or 25 hours across a DST
  // transition, so subtracting `days * 24h` could drift by an hour and shift a boundary-day
  // decision. `setDate` arithmetic keeps the cutoff stable in LOCAL calendar days, matching the
  // local-midnight timestamps that `parseLogDate` produces.
  const cutoff = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate());
  cutoff.setDate(cutoff.getDate() - input.retentionDays);
  const cutoffTime = cutoff.getTime();

  let entries: readonly string[];
  try {
    entries = await readdir(input.dir);
  } catch {
    return [];
  }

  const deleted: string[] = [];
  for (const name of entries) {
    const date = parseLogDate(name);
    if (date === undefined || date.getTime() >= cutoffTime) continue;
    try {
      await rm(join(input.dir, name), { recursive: true, force: true });
      deleted.push(name);
    } catch {
      // One stubborn directory (e.g. locked on Windows) must not abort the whole sweep - skip it
      // and continue; it is retried on the next startup.
    }
  }
  return deleted;
}
