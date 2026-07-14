import { describe, expect, test } from 'bun:test';

import { createDb } from './connection';
import { runMigrations } from './migrate';

/**
 * The current schema includes a nullable `pinned_at` column (epoch seconds, no default) on the
 * `conversation` table. A freshly migrated row that is never pinned must read back with
 * `pinned_at` null, proving the column exists and defaults to null.
 */
describe('pinned_at column (current schema)', () => {
  test('a conversation inserted without pinned_at reads back null', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const client = db.$client;

    // The column exists on the migrated table.
    const cols = client.query('PRAGMA table_info(`conversation`)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('pinned_at');

    // Inserting a row without specifying pinned_at leaves it null (nullable, no default).
    client.run(
      'INSERT INTO `conversation` (`id`, `owner`, `title`, `messages`, `reasoning_override`, `revision`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['aaa-111', 'local', 'Hello', '[]', null, 0, 100, 100],
    );
    const row = client
      .query('SELECT * FROM `conversation` WHERE `owner` = ?')
      .get('local') as Record<string, unknown>;
    expect(row.id).toBe('aaa-111');
    expect(row.pinned_at).toBe(null);
  });
});
