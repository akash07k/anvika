import { createHash } from 'node:crypto';

import type { EmbeddedMigration } from '../../generated/embedded';
import type { AnvikaDb } from './connection';

/** The internal migration shape Drizzle's `dialect.migrate` consumes. */
interface MigrationMeta {
  sql: string[];
  bps: boolean;
  folderMillis: number;
  hash: string;
}

/**
 * Minimal structural view of the Drizzle bun-sqlite handle's internal migrate entrypoint, so we
 * can reuse it without `any` or non-null assertions. Confirmed against drizzle-orm 0.45.2
 * (`SQLiteDialect.migrate(migrations, session, config)`, table defaults to
 * `__drizzle_migrations`).
 */
interface MigratableDb {
  dialect: {
    migrate(migrations: MigrationMeta[], session: unknown, config: Record<string, unknown>): void;
  };
  session: unknown;
}

/**
 * Apply embedded migrations to {@link db} using Drizzle's own dialect migrator, replacing only
 * the file-reading step the on-disk migrator performs. Hashing and tracking (the
 * `__drizzle_migrations` table) are therefore identical to Drizzle's folder migrator, so a
 * database created either way is interchangeable and this is idempotent.
 *
 * @param db - The Drizzle bun-sqlite handle.
 * @param migrations - The embedded migrations (generated `MIGRATIONS`), in journal order.
 */
export function runEmbeddedMigrations(
  db: AnvikaDb,
  migrations: readonly EmbeddedMigration[],
): void {
  const metas: MigrationMeta[] = migrations.map((m) => ({
    sql: m.sql.split('--> statement-breakpoint'),
    bps: m.breakpoints,
    folderMillis: m.when,
    hash: createHash('sha256').update(m.sql).digest('hex'),
  }));
  const migratable = db as unknown as MigratableDb;
  migratable.dialect.migrate(metas, migratable.session, {});
}
