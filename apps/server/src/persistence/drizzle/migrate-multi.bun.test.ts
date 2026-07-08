import { describe, expect, test } from 'bun:test';

import { createDb } from './connection';
import { runMigrations } from './migrate';

/**
 * Verifies that `runMigrations` over an empty database applies the single baseline migration
 * (`0000_freezing_hercules`) and produces the full current schema. A round-trip insert/select
 * confirms the id-keyed shape and every expected column.
 */

describe('multi-conversation migrations (fresh install)', () => {
  test('runMigrations over an empty db yields the id-keyed shape and round-trips', () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const client = db.$client;

    // The baseline migration created the conversation table with its full column set.
    const cols = client.query('PRAGMA table_info(`conversation`)').all() as { name: string }[];
    const names = cols.map((c) => c.name).toSorted();
    expect(names).toEqual([
      'created_at',
      'forked_from_id',
      'forked_from_message_id',
      'id',
      'messages',
      'model_id',
      'owner',
      'pinned_at',
      'reasoning_override',
      'revision',
      'title',
      'updated_at',
    ]);

    // An insert/select round-trips through the id-keyed shape.
    client.run(
      'INSERT INTO `conversation` (`id`, `owner`, `title`, `messages`, `reasoning_override`, `revision`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['aaa-111', 'local', 'Hello', '[]', 'high', 0, 100, 100],
    );
    const row = client
      .query('SELECT * FROM `conversation` WHERE `owner` = ?')
      .get('local') as Record<string, unknown>;
    expect(row.id).toBe('aaa-111');
    expect(row.owner).toBe('local');
    expect(row.title).toBe('Hello');
    expect(row.messages).toBe('[]');
    expect(row.reasoning_override).toBe('high');
    expect(row.revision).toBe(0);
    expect(row.created_at).toBe(100);
    expect(row.updated_at).toBe(100);

    // The app_state pointer table also exists.
    const appState = client.query('PRAGMA table_info(`app_state`)').all() as { name: string }[];
    expect(appState.map((c) => c.name).toSorted()).toEqual([
      'last_active_conversation_id',
      'owner',
      'updated_at',
    ]);
  });
});
