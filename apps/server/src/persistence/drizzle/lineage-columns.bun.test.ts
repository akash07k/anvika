import { describe, expect, test } from 'bun:test';

import { createDb } from './connection';
import { runMigrations } from './migrate';

/**
 * The current schema includes nullable `forked_from_id` and `forked_from_message_id` columns
 * (soft lineage references, no default) on the `conversation` table. A freshly migrated row
 * that was never branched must read both columns back as null, proving they exist and default to
 * null.
 */
describe('forked_from lineage columns (current schema)', () => {
  test('a conversation inserted without lineage reads both columns back null', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const client = db.$client;

    // Both lineage columns exist on the migrated table.
    const cols = client.query('PRAGMA table_info(`conversation`)').all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain('forked_from_id');
    expect(names).toContain('forked_from_message_id');

    // Inserting a row without the lineage columns leaves them null (nullable, no default).
    client.run(
      'INSERT INTO `conversation` (`id`, `owner`, `title`, `messages`, `reasoning_override`, `revision`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['aaa-111', 'local', 'Hello', '[]', null, 0, 100, 100],
    );
    const row = client
      .query('SELECT * FROM `conversation` WHERE `owner` = ?')
      .get('local') as Record<string, unknown>;
    expect(row.id).toBe('aaa-111');
    expect(row.forked_from_id).toBe(null);
    expect(row.forked_from_message_id).toBe(null);
  });
});
