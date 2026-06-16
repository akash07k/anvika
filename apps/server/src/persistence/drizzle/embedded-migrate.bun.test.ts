import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

import type { EmbeddedMigration } from '../../generated/embedded';
import * as schema from './schema';
import { runEmbeddedMigrations } from './embedded-migrate';

const MIGS: EmbeddedMigration[] = [
  { tag: '0000_t', when: 1, breakpoints: true, sql: 'CREATE TABLE a (id integer);' },
  { tag: '0001_t', when: 2, breakpoints: true, sql: 'CREATE TABLE b (id integer);' },
];

const makeDb = () => drizzle({ client: new Database(':memory:'), schema });

const tables = (db: ReturnType<typeof makeDb>): string[] =>
  db
    .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .map((r) => r.name)
    .sort();

const hashes = (db: ReturnType<typeof makeDb>): string[] =>
  db
    .all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations ORDER BY created_at`)
    .map((r) => r.hash);

test('applies all embedded migrations to a fresh database', () => {
  const db = makeDb();
  runEmbeddedMigrations(db, MIGS);
  expect(tables(db)).toContain('a');
  expect(tables(db)).toContain('b');
  expect(tables(db)).toContain('__drizzle_migrations');
});

test('is idempotent on a second run', () => {
  const db = makeDb();
  runEmbeddedMigrations(db, MIGS);
  runEmbeddedMigrations(db, MIGS);
  const rows = db.all<{ c: number }>(sql`SELECT count(*) AS c FROM __drizzle_migrations`);
  expect(rows[0]?.c).toBe(2);
});

test('applies a multi-statement migration split on statement-breakpoint', () => {
  const db = makeDb();
  runEmbeddedMigrations(db, [
    {
      tag: '0000_multi',
      when: 1,
      breakpoints: true,
      sql: 'CREATE TABLE a (id integer);\n--> statement-breakpoint\nCREATE TABLE b (id integer);',
    },
  ]);
  expect(tables(db)).toContain('a');
  expect(tables(db)).toContain('b');
});

test('is interchangeable with Drizzle real folder migrator (same hashes and tables)', () => {
  const drizzleDir = join(import.meta.dir, '..', '..', '..', 'drizzle');
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string; when: number; breakpoints: boolean }[];
  };
  const embedded: EmbeddedMigration[] = journal.entries.map((e) => ({
    tag: e.tag,
    when: e.when,
    breakpoints: e.breakpoints,
    sql: readFileSync(join(drizzleDir, `${e.tag}.sql`), 'utf8'),
  }));

  const folderDb = makeDb();
  migrate(folderDb, { migrationsFolder: drizzleDir });

  const embeddedDb = makeDb();
  runEmbeddedMigrations(embeddedDb, embedded);

  expect(hashes(embeddedDb)).toEqual(hashes(folderDb));
  expect(tables(embeddedDb)).toEqual(tables(folderDb));
});
