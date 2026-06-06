import { resolve } from 'node:path';

import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import type { AnvikaDb } from './connection';

/** Absolute path to the generated migration SQL (apps/server/drizzle). */
const MIGRATIONS_DIR = resolve(import.meta.dir, '..', '..', '..', 'drizzle');

/**
 * Apply all pending Drizzle migrations to `db`. Run once at startup before serving. The
 * bun-sqlite migrator is synchronous (do not await it); it records applied migrations in an
 * internal table and is a no-op when up to date.
 *
 * @param db - The Drizzle database handle from {@link createDb}.
 */
export function runMigrations(db: AnvikaDb): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
