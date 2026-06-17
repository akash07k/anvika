import { describe, expect, test } from 'bun:test';
import type { UIMessage } from 'ai';

import { NEW_CONVERSATION_TITLE } from '@anvika/shared/conversation/title';

import { createDb, type AnvikaDbWithClient } from './connection';
import { DrizzleMultiConversationStore } from './drizzle-multi-conversation-store';
import { FALLBACK_CONVERSATION_TITLE } from './drizzle-conversation-read';
import { runMigrations } from './migrate';

const OWNER = 'local';
const ID_A = 'aaa-111';
const ID_B = 'bbb-222';
const ID_C = 'ccc-333';

function makeDb(): AnvikaDbWithClient {
  const db = createDb(':memory:');
  runMigrations(db);
  return db;
}

function makeStore(db: AnvikaDbWithClient = makeDb()): DrizzleMultiConversationStore {
  return new DrizzleMultiConversationStore(db);
}

function msg(id: string, role: 'user' | 'assistant', text: string): UIMessage {
  return { id, role, parts: [{ type: 'text', text }] } as UIMessage;
}

/** Read the raw stored `updated_at` for a row, to assert it is (or is not) touched by a write. */
function rawUpdatedAt(db: AnvikaDbWithClient, id: string): number {
  const row = db.$client.query('SELECT updated_at FROM `conversation` WHERE id = ?').get(id) as {
    updated_at: number;
  } | null;
  return row?.updated_at ?? -1;
}

/** Read the raw stored `pinned_at` for a row, to assert a pin write sets or clears it. */
function rawPinnedAt(db: AnvikaDbWithClient, id: string): number | null {
  const row = db.$client.query('SELECT pinned_at FROM `conversation` WHERE id = ?').get(id) as {
    pinned_at: number | null;
  } | null;
  return row?.pinned_at ?? null;
}

/** Column tuple for a raw seeded row (corrupt columns and fixed timestamps saveTurn cannot make). */
type SeedRow = [
  id: string,
  owner: string,
  title: string | null,
  override: string | null,
  revision: number,
  updatedAt: number,
];

/** Seed a raw conversation row directly via SQL, bypassing the store to inject arbitrary states. */
function seedRow(
  db: AnvikaDbWithClient,
  [id, owner, title, override, revision, updatedAt]: SeedRow,
): void {
  db.$client.run(
    'INSERT INTO `conversation` (`id`, `owner`, `title`, `messages`, `reasoning_override`, `revision`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, owner, title, '[]', override, revision, 100, updatedAt],
  );
}

describe('DrizzleMultiConversationStore saveTurn', () => {
  test('creates on first call and load shows the derived title and revision 1', async () => {
    const store = makeStore();
    const messages = [msg('u1', 'user', 'Plan my week'), msg('a1', 'assistant', 'Sure')];
    const result = await store.saveTurn(OWNER, ID_A, messages);
    expect(result).toEqual({ ok: true, revision: 1 });
    const loaded = await store.load(OWNER, ID_A);
    expect(loaded?.title).toBe('Plan my week');
    expect(loaded?.revision).toBe(1);
    expect(loaded?.messages).toEqual(messages);
  });

  test('empty-messages saveTurn on an existing row is an atomic no-op (no clobber, no revision bump)', async () => {
    const store = makeStore();
    const messages = [msg('u1', 'user', 'hello'), msg('a1', 'assistant', 'hi')];
    await store.saveTurn(OWNER, ID_A, messages); // revision 1, real messages
    // The override routes' create-if-absent probe: saveTurn([]) on the EXISTING row must not clobber
    // its messages or bump its revision - it returns the stored revision untouched.
    const result = await store.saveTurn(OWNER, ID_A, []);
    expect(result).toEqual({ ok: true, revision: 1 });
    const loaded = await store.load(OWNER, ID_A);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.messages).toEqual(messages); // messages preserved, NOT emptied
  });

  test('empty-messages saveTurn on an absent row creates a revision-1 placeholder row', async () => {
    const store = makeStore();
    const result = await store.saveTurn(OWNER, ID_A, []);
    expect(result).toEqual({ ok: true, revision: 1 });
    const loaded = await store.load(OWNER, ID_A);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.title).toBe(NEW_CONVERSATION_TITLE);
    expect(loaded?.messages).toEqual([]);
  });

  test('bumps to revision 2 on a matching baseRevision', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const next = [msg('u1', 'user', 'Plan my week'), msg('a1', 'assistant', 'Done')];
    const result = await store.saveTurn(OWNER, ID_A, next, 1);
    expect(result).toEqual({ ok: true, revision: 2 });
    expect((await store.load(OWNER, ID_A))?.revision).toBe(2);
  });

  test('a stale baseRevision returns conflict without mutating messages or revision', async () => {
    const store = makeStore();
    const original = [msg('u1', 'user', 'Plan my week')];
    await store.saveTurn(OWNER, ID_A, original);
    await store.saveTurn(OWNER, ID_A, [...original, msg('a1', 'assistant', 'r1')], 1);
    // stored revision is now 2; a writer holding baseRevision 1 conflicts.
    const stale = await store.saveTurn(OWNER, ID_A, [msg('x', 'user', 'stale')], 1);
    expect(stale).toEqual({ ok: false, conflict: true, currentRevision: 2 });
    const loaded = await store.load(OWNER, ID_A);
    expect(loaded?.revision).toBe(2);
    expect(loaded?.messages).toEqual([...original, msg('a1', 'assistant', 'r1')]);
  });

  test('with no baseRevision on an existing row still updates and bumps', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const result = await store.saveTurn(OWNER, ID_A, [msg('u2', 'user', 'again')]);
    expect(result).toEqual({ ok: true, revision: 2 });
    expect((await store.load(OWNER, ID_A))?.messages).toEqual([msg('u2', 'user', 'again')]);
  });

  test('baseRevision 0 against a revision-0 row succeeds and bumps to 1 (NOT a conflict)', async () => {
    // The 0004 migration genuinely produces revision-0 rows, so 0 is the exact at-risk value: a
    // truthiness bug would treat baseRevision 0 as absent. It must match the stored 0 and bump.
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Migrated', null, 0, 100]);
    const result = await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'first turn')], 0);
    expect(result).toEqual({ ok: true, revision: 1 });
    expect((await store.load(OWNER, ID_A))?.revision).toBe(1);
  });
});

describe('DrizzleMultiConversationStore saveTurn title derivation on a pre-created draft', () => {
  test('the first content-bearing turn derives the title of a pre-created empty draft', async () => {
    const store = makeStore();
    // A pre-created empty draft (e.g. from the reasoning create-if-absent path) gets the placeholder.
    await store.saveTurn(OWNER, ID_A, []);
    expect((await store.load(OWNER, ID_A))?.title).toBe(NEW_CONVERSATION_TITLE);
    // The first real turn must derive the title from the first user message, not keep the placeholder.
    const messages = [msg('u1', 'user', 'Plan my week'), msg('a1', 'assistant', 'Sure')];
    await store.saveTurn(OWNER, ID_A, messages, 1);
    expect((await store.load(OWNER, ID_A))?.title).toBe('Plan my week');
  });

  test('a later turn never clobbers a real title (renamed)', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    await store.rename(OWNER, ID_A, 'My own title');
    await store.saveTurn(OWNER, ID_A, [msg('u2', 'user', 'second turn')], 1);
    expect((await store.load(OWNER, ID_A))?.title).toBe('My own title');
  });

  test('a later turn never clobbers an already-derived title', async () => {
    const store = makeStore();
    // Created with messages, so it gets a derived title on INSERT.
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    expect((await store.load(OWNER, ID_A))?.title).toBe('Plan my week');
    // A later turn whose first user text differs must NOT re-derive over the existing title.
    await store.saveTurn(OWNER, ID_A, [msg('u2', 'user', 'A different first message')], 1);
    expect((await store.load(OWNER, ID_A))?.title).toBe('Plan my week');
  });
});

describe('DrizzleMultiConversationStore load', () => {
  test('returns null for an unknown id', async () => {
    const store = makeStore();
    expect(await store.load(OWNER, ID_A)).toBeNull();
  });

  test('returns the full detail for a known id', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const loaded = await store.load(OWNER, ID_A);
    expect(loaded).toEqual({
      messages: [msg('u1', 'user', 'Plan my week')],
      title: 'Plan my week',
      reasoningOverride: null,
      modelId: null,
      revision: 1,
    });
  });

  test('title fail-soft: an over-long stored title reads as the fallback', async () => {
    const db = makeDb();
    const store = makeStore(db);
    const longTitle = 'x'.repeat(201);
    seedRow(db, [ID_A, OWNER, longTitle, null, 1, 100]);
    expect((await store.load(OWNER, ID_A))?.title).toBe(FALLBACK_CONVERSATION_TITLE);
  });

  test('reasoning fail-soft: a bogus stored override reads back as null', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Hi', 'bogus', 1, 100]);
    expect((await store.load(OWNER, ID_A))?.reasoningOverride).toBeNull();
  });
});

describe('DrizzleMultiConversationStore list', () => {
  test('returns summaries ordered by updatedAt DESC', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Oldest', null, 1, 100]);
    seedRow(db, [ID_B, OWNER, 'Newest', null, 3, 300]);
    seedRow(db, [ID_C, OWNER, 'Middle', null, 2, 200]);
    const summaries = await store.list(OWNER);
    expect(summaries).toEqual([
      { id: ID_B, title: 'Newest', updatedAt: 300, pinnedAt: null, revision: 3 },
      { id: ID_C, title: 'Middle', updatedAt: 200, pinnedAt: null, revision: 2 },
      { id: ID_A, title: 'Oldest', updatedAt: 100, pinnedAt: null, revision: 1 },
    ]);
  });

  test('scopes to the owner', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Mine', null, 1, 100]);
    seedRow(db, [ID_B, 'someone-else', 'Theirs', null, 1, 100]);
    const summaries = await store.list(OWNER);
    expect(summaries.map((s) => s.id)).toEqual([ID_A]);
  });

  test('surfaces pinnedAt: the stored seconds for a pinned row, null for a never-pinned row', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'pinned one')]);
    await store.saveTurn(OWNER, ID_B, [msg('u2', 'user', 'unpinned one')]);
    // Pin ID_A directly (the store has no pin-write method yet - that is a later task).
    db.$client.run('UPDATE `conversation` SET `pinned_at` = ? WHERE id = ?', [1781785075, ID_A]);
    const summaries = await store.list(OWNER);
    const byId = new Map(summaries.map((s) => [s.id, s.pinnedAt]));
    expect(byId.get(ID_A)).toBe(1781785075);
    expect(byId.get(ID_B)).toBeNull();
  });
});

describe('DrizzleMultiConversationStore rename', () => {
  test('rename changes title only and leaves revision AND updated_at unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const before = await store.load(OWNER, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    await store.rename(OWNER, ID_A, 'Renamed conversation');
    const after = await store.load(OWNER, ID_A);
    expect(after?.title).toBe('Renamed conversation');
    expect(after?.revision).toBe(before?.revision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });
});

describe('DrizzleMultiConversationStore setPinned', () => {
  test('setPinned(true) sets a non-null pinned_at and leaves revision AND updated_at unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const before = await store.load(OWNER, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    expect(await store.setPinned(OWNER, ID_A, true)).toBe(true);
    expect(rawPinnedAt(db, ID_A)).not.toBeNull();
    const after = await store.load(OWNER, ID_A);
    expect(after?.revision).toBe(before?.revision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });

  test('setPinned(false) clears pinned_at to null and leaves revision AND updated_at unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    await store.setPinned(OWNER, ID_A, true);
    const before = await store.load(OWNER, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    expect(await store.setPinned(OWNER, ID_A, false)).toBe(true);
    expect(rawPinnedAt(db, ID_A)).toBeNull();
    const after = await store.load(OWNER, ID_A);
    expect(after?.revision).toBe(before?.revision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });

  test('setPinned on an unknown id affects zero rows, returns false, and does not throw', async () => {
    const store = makeStore();
    expect(await store.setPinned(OWNER, 'nonexistent-id', true)).toBe(false);
    expect(await store.load(OWNER, 'nonexistent-id')).toBeNull();
    expect(await store.list(OWNER)).toHaveLength(0);
  });
});

describe('DrizzleMultiConversationStore healMessages', () => {
  test('healMessages changes messages only and leaves revision AND updated_at unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'Plan my week')]);
    const before = await store.load(OWNER, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    const healed = [msg('u1', 'user', 'Plan my week'), msg('a1', 'assistant', 'healed')];
    await store.healMessages(OWNER, ID_A, healed);
    const after = await store.load(OWNER, ID_A);
    expect(after?.messages).toEqual(healed);
    expect(after?.revision).toBe(before?.revision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });
});

describe('DrizzleMultiConversationStore delete and deleteMany', () => {
  test('delete removes one row', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'one')]);
    await store.delete(OWNER, ID_A);
    expect(await store.load(OWNER, ID_A)).toBeNull();
  });

  test('deleteMany removes the named subset and leaves others', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'a')]);
    await store.saveTurn(OWNER, ID_B, [msg('u2', 'user', 'b')]);
    await store.saveTurn(OWNER, ID_C, [msg('u3', 'user', 'c')]);
    await store.deleteMany(OWNER, [ID_A, ID_C]);
    expect(await store.load(OWNER, ID_A)).toBeNull();
    expect(await store.load(OWNER, ID_C)).toBeNull();
    expect(await store.load(OWNER, ID_B)).not.toBeNull();
  });

  test('deleteMany([]) is a no-op', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'a')]);
    await store.deleteMany(OWNER, []);
    expect(await store.load(OWNER, ID_A)).not.toBeNull();
  });
});

describe('DrizzleMultiConversationStore getActiveId / setActiveId', () => {
  test('getActiveId is null when unset', async () => {
    const store = makeStore();
    expect(await store.getActiveId(OWNER)).toBeNull();
  });

  test('setActiveId then getActiveId round-trips the value', async () => {
    const store = makeStore();
    await store.setActiveId(OWNER, ID_A);
    expect(await store.getActiveId(OWNER)).toBe(ID_A);
  });

  test('calling setActiveId again overwrites the previous value', async () => {
    const store = makeStore();
    await store.setActiveId(OWNER, ID_A);
    await store.setActiveId(OWNER, ID_B);
    expect(await store.getActiveId(OWNER)).toBe(ID_B);
  });

  test('setActiveId with null clears the pointer', async () => {
    const store = makeStore();
    await store.setActiveId(OWNER, ID_A);
    await store.setActiveId(OWNER, null);
    expect(await store.getActiveId(OWNER)).toBeNull();
  });

  test('pointer is owner-scoped: different owners are independent', async () => {
    const store = makeStore();
    await store.setActiveId(OWNER, ID_A);
    await store.setActiveId('other-owner', ID_B);
    expect(await store.getActiveId(OWNER)).toBe(ID_A);
    expect(await store.getActiveId('other-owner')).toBe(ID_B);
  });
});

/** Read the raw stored `revision` for a row, to assert it is not bumped by non-saveTurn writes. */
function rawRevision(db: AnvikaDbWithClient, id: string): number {
  const row = db.$client.query('SELECT revision FROM `conversation` WHERE id = ?').get(id) as {
    revision: number;
  } | null;
  return row?.revision ?? -1;
}

describe('DrizzleMultiConversationStore getReasoningOverride / setReasoningOverride', () => {
  test('set on an existing row updates the override; get returns it; revision and updated_at are unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'hello')]);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    const beforeRevision = rawRevision(db, ID_A);
    await store.setReasoningOverride(OWNER, ID_A, 'high');
    expect(await store.getReasoningOverride(OWNER, ID_A)).toBe('high');
    expect(rawRevision(db, ID_A)).toBe(beforeRevision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });

  test('set on an unknown id does NOT create a row', async () => {
    const store = makeStore();
    await store.setReasoningOverride(OWNER, ID_A, 'low');
    expect(await store.load(OWNER, ID_A)).toBeNull();
    expect(await store.list(OWNER)).toHaveLength(0);
  });

  test('get fail-soft: bogus stored value reads as null', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Hi', 'bogus', 1, 100]);
    expect(await store.getReasoningOverride(OWNER, ID_A)).toBeNull();
  });

  test('get on a row with NULL override returns null', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Hi', null, 1, 100]);
    expect(await store.getReasoningOverride(OWNER, ID_A)).toBeNull();
  });

  test('get on an unknown id returns null', async () => {
    const store = makeStore();
    expect(await store.getReasoningOverride(OWNER, ID_A)).toBeNull();
  });

  test('set null on an existing row clears the override without bumping revision or updated_at', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Hi', 'high', 5, 200]);
    const beforeRevision = rawRevision(db, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    await store.setReasoningOverride(OWNER, ID_A, null);
    expect(await store.getReasoningOverride(OWNER, ID_A)).toBeNull();
    expect(rawRevision(db, ID_A)).toBe(beforeRevision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });
});

describe('DrizzleMultiConversationStore getModelOverride / setModelOverride', () => {
  test('set on an existing row updates the override; get returns it; revision and updated_at are unchanged', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'hello')]);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    const beforeRevision = rawRevision(db, ID_A);
    await store.setModelOverride(OWNER, ID_A, 'openai:gpt-4o');
    expect(await store.getModelOverride(OWNER, ID_A)).toBe('openai:gpt-4o');
    expect(rawRevision(db, ID_A)).toBe(beforeRevision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });

  test('set on an unknown id does NOT create a row', async () => {
    const store = makeStore();
    await store.setModelOverride(OWNER, ID_A, 'openai:gpt-4o');
    expect(await store.load(OWNER, ID_A)).toBeNull();
    expect(await store.list(OWNER)).toHaveLength(0);
  });

  test('get returns a stored id verbatim, even a non-namespaced one (unresolvable ids surface as model-unavailable downstream, never silently dropped to the default)', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'hello')]);
    await store.setModelOverride(OWNER, ID_A, 'gpt-4o');
    expect(await store.getModelOverride(OWNER, ID_A)).toBe('gpt-4o');
  });

  test('get on a row with NULL override returns null', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, 'Hi', null, 1, 100]);
    expect(await store.getModelOverride(OWNER, ID_A)).toBeNull();
  });

  test('get fail-soft: a stored empty-string model_id reads back as null (legacy/corrupt = inherit)', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'hello')]);
    // The write boundary forbids '' (SetModelOverrideSchema), but a legacy or corrupt row could hold
    // it; on read it must fail soft to null (inherit), never an unresolvable empty model id.
    db.$client.run('UPDATE `conversation` SET `model_id` = ? WHERE `id` = ?', ['', ID_A]);
    expect(await store.getModelOverride(OWNER, ID_A)).toBeNull();
  });

  test('get on an unknown id returns null', async () => {
    const store = makeStore();
    expect(await store.getModelOverride(OWNER, ID_A)).toBeNull();
  });

  test('set null on an existing row clears the override without bumping revision or updated_at', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, [msg('u1', 'user', 'hello')]);
    await store.setModelOverride(OWNER, ID_A, 'openai:gpt-4o');
    const beforeRevision = rawRevision(db, ID_A);
    const beforeUpdatedAt = rawUpdatedAt(db, ID_A);
    await store.setModelOverride(OWNER, ID_A, null);
    expect(await store.getModelOverride(OWNER, ID_A)).toBeNull();
    expect(rawRevision(db, ID_A)).toBe(beforeRevision);
    expect(rawUpdatedAt(db, ID_A)).toBe(beforeUpdatedAt);
  });
});

/** Read the raw lineage columns for a row, to assert the branch wrote `forked_from_*` directly. */
function rawLineage(
  db: AnvikaDbWithClient,
  id: string,
): { forkedFromId: string | null; forkedFromMessageId: string | null } {
  const row = db.$client
    .query('SELECT forked_from_id, forked_from_message_id FROM `conversation` WHERE id = ?')
    .get(id) as { forked_from_id: string | null; forked_from_message_id: string | null } | null;
  return {
    forkedFromId: row?.forked_from_id ?? null,
    forkedFromMessageId: row?.forked_from_message_id ?? null,
  };
}

describe('DrizzleMultiConversationStore branch', () => {
  const THREE = [
    msg('m1', 'user', 'First question'),
    msg('m2', 'assistant', 'First answer'),
    msg('m3', 'user', 'Second question'),
  ];

  test('throughIndex undefined copies all messages, sets lineage, revision 1, and Branch of <title>', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, THREE);
    await store.rename(OWNER, ID_A, 'My research thread');
    await store.setReasoningOverride(OWNER, ID_A, 'high');
    const result = await store.branch(OWNER, ID_A, ID_B, undefined, 1);
    expect(result).toEqual({
      ok: true,
      summary: expect.objectContaining({
        id: ID_B,
        title: 'Branch of My research thread',
        revision: 1,
      }),
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.summary.pinnedAt).toBeNull();
    const loaded = await store.load(OWNER, ID_B);
    expect(loaded?.messages).toEqual(THREE);
    expect(loaded?.revision).toBe(1);
    expect(loaded?.reasoningOverride).toBe('high');
    expect(loaded?.title).toBe('Branch of My research thread');
    expect(rawLineage(db, ID_B)).toEqual({ forkedFromId: ID_A, forkedFromMessageId: 'm3' });
  });

  test('an empty-titled source branches to Branch of Untitled conversation', async () => {
    const db = makeDb();
    const store = makeStore(db);
    seedRow(db, [ID_A, OWNER, '', null, 1, 100]);
    db.$client.run('UPDATE `conversation` SET `messages` = ? WHERE id = ?', [
      JSON.stringify(THREE),
      ID_A,
    ]);
    const result = await store.branch(OWNER, ID_A, ID_B, undefined, 1);
    expect(result.ok).toBe(true);
    expect((await store.load(OWNER, ID_B))?.title).toBe('Branch of Untitled conversation');
  });

  test('throughIndex 0 copies only the first message and titles via deriveConversationTitle', async () => {
    const db = makeDb();
    const store = makeStore(db);
    await store.saveTurn(OWNER, ID_A, THREE);
    const result = await store.branch(OWNER, ID_A, ID_B, 0, 1);
    expect(result.ok).toBe(true);
    const loaded = await store.load(OWNER, ID_B);
    expect(loaded?.messages).toEqual(THREE.slice(0, 1));
    expect(loaded?.title).toBe('First question');
    // Lineage points at the source and the LAST copied message (the first message, 'm1', for index 0).
    expect(rawLineage(db, ID_B)).toEqual({ forkedFromId: ID_A, forkedFromMessageId: 'm1' });
  });

  test('a source with a NULL reasoningOverride branches to a null override', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, THREE);
    // The source has never had an override set, so it is NULL - the branch must copy null, not a value.
    const result = await store.branch(OWNER, ID_A, ID_B, undefined, 1);
    expect(result.ok).toBe(true);
    expect((await store.load(OWNER, ID_B))?.reasoningOverride).toBeNull();
  });

  test('a missing source returns not-found', async () => {
    const store = makeStore();
    expect(await store.branch(OWNER, ID_A, ID_B, undefined, 1)).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  test('a stale baseRevision returns conflict with the current revision', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, THREE);
    await store.saveTurn(OWNER, ID_A, [...THREE, msg('m4', 'assistant', 'more')], 1);
    // stored revision is now 2; a brancher holding baseRevision 1 conflicts.
    expect(await store.branch(OWNER, ID_A, ID_B, undefined, 1)).toEqual({
      ok: false,
      reason: 'conflict',
      currentRevision: 2,
    });
    expect(await store.load(OWNER, ID_B)).toBeNull();
  });

  test('a newId that already exists returns collision and leaves the existing row intact', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, THREE);
    await store.saveTurn(OWNER, ID_B, [msg('x', 'user', 'existing')]);
    expect(await store.branch(OWNER, ID_A, ID_B, undefined, 1)).toEqual({
      ok: false,
      reason: 'collision',
    });
    expect((await store.load(OWNER, ID_B))?.messages).toEqual([msg('x', 'user', 'existing')]);
  });

  test('a throughIndex past the last message returns bad-index', async () => {
    const store = makeStore();
    await store.saveTurn(OWNER, ID_A, THREE);
    expect(await store.branch(OWNER, ID_A, ID_B, 3, 1)).toEqual({ ok: false, reason: 'bad-index' });
    expect(await store.load(OWNER, ID_B)).toBeNull();
  });
});
