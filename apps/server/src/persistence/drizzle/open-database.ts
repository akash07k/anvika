import { join } from 'node:path';

import { createDb } from './connection';
import type { AnvikaDb } from './connection';
import { DB_FILENAME } from './db-file';

/**
 * Open the Anvika database at `<dataDir>/anvika.db`, rethrowing any open failure as one actionable
 * startup error. `resolveDataDir` already verified the directory is writable; this catches the
 * residual case where the directory reports writable but the database file itself cannot be opened
 * (a read-only or locked `anvika.db`, common on Windows where the directory writability bit does not
 * predict the file open). Without this wrap the raw `bun:sqlite` error reaches the operator.
 *
 * @param dataDir - The resolved, writable application data directory.
 * @returns The typed Drizzle database handle.
 * @throws If the database file cannot be opened, with a message naming the path and `--data-dir`.
 */
export function openDatabase(dataDir: string): AnvikaDb {
  const path = join(dataDir, DB_FILENAME);
  try {
    return createDb(path);
  } catch (err) {
    throw new Error(
      `Anvika could not open its database at ${path}. Ensure the file is writable, or pass ` +
        `--data-dir <path> to use a different writable location. (${String(err)})`,
      { cause: err },
    );
  }
}
