import { Database } from 'bun:sqlite';
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

import * as schema from './schema';

/** The typed Drizzle database handle for Anvika (Bun SQLite, full schema). */
export type AnvikaDb = BunSQLiteDatabase<typeof schema>;

/**
 * A typed Drizzle handle paired with its underlying Bun SQLite client. The `$client` field is
 * the raw `bun:sqlite` `Database`, exposed for tests that need raw SQL (e.g. migration assertions);
 * production code uses only the Drizzle handle.
 */
export type AnvikaDbWithClient = AnvikaDb & { $client: Database };

/**
 * Open the Bun SQLite database at `path` and wrap it with Drizzle. Pass `':memory:'` for an
 * ephemeral in-process database (tests). The caller runs migrations before issuing queries.
 *
 * @param path - The SQLite file path, or `':memory:'`.
 * @returns A typed Drizzle database handle with its underlying client on `$client`.
 */
export function createDb(path: string): AnvikaDbWithClient {
  return drizzle({ client: new Database(path), schema });
}
