/**
 * The on-disk SQLite database filename. Shared by the runtime path ({@link openDatabase} via
 * `server.ts`) and the drizzle-kit CLI default (`drizzle.config.ts`) so the two cannot drift.
 */
export const DB_FILENAME = 'anvika.db';
