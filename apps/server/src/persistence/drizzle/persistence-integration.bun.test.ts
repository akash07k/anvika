import { describe, expect, spyOn, test } from 'bun:test';

import { CURRENT_SETTINGS_VERSION, SettingsSchema } from '@anvika/shared/settings/schema';

import { createApp } from '../../app';
import { serverLogger } from '../../logging/logger';
import type { SettingsStore } from '../ports';
import { createDb, type AnvikaDbWithClient } from './connection';
import { DrizzleMultiConversationStore } from './drizzle-multi-conversation-store';
import { runMigrations } from './migrate';

import type { UIMessage } from 'ai';

/** A valid short id the conversation-id schema accepts. */
const CONV_ID = 'k7m-2qp';

/** Persisted messages carry `metadata.createdAt`, which `MessageMetadataSchema` requires on read. */
const MD = { createdAt: 1700000000000 };

/** A user + assistant transcript with valid metadata (mirrors what the chat route would persist). */
const turnMessages: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: MD },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'ok' }], metadata: MD },
];

/** A single user turn with valid metadata. */
const userOnly: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }], metadata: MD },
];

/** An offline settings store: empty connections so the models route never attempts live discovery. */
const settingsStore: SettingsStore = {
  load: async () => ({
    data: SettingsSchema.parse({ connections: [] }),
    version: CURRENT_SETTINGS_VERSION,
  }),
  save: async () => undefined,
};

/**
 * Compose the real app over the real id-keyed store. The chat route owns its model resolver and needs
 * a configured provider, which is out of scope here - the id-keyed chat-persistence path is covered by
 * routes/chat.test.ts. This integration test drives the conversations routes against the REAL Drizzle
 * adapter end to end (migrations, JSON columns, raw SQL), persisting turns through the store directly.
 */
function makeApp(store: DrizzleMultiConversationStore) {
  return createApp({
    assetSource: undefined,
    logContent: false,
    multiConversationStore: store,
    retitle: async () => 'New conversation',
    settingsStore,
    settingsPaths: { settings: 's', secrets: 'x' },
    globalLogOff: false,
  });
}

describe('persistence integration (real id-keyed adapter + app + migrations)', () => {
  test('a completed turn persists by id and is restored by GET /:id', async () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const store = new DrizzleMultiConversationStore(db);
    await store.saveTurn('local', CONV_ID, turnMessages);
    const app = makeApp(store);

    const get = await app.request(`/api/v1/conversations/${CONV_ID}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { messages: { role: string }[]; revision: number };
    expect(body.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(body.revision).toBe(1);
  });

  test('a per-conversation reasoning override set via PATCH is read back on GET /:id', async () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const store = new DrizzleMultiConversationStore(db);
    const app = makeApp(store);

    // Set the override via the real route. Create-if-absent mints the row for a draft id.
    const patch = await app.request(`/api/v1/conversations/${CONV_ID}/reasoning`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reasoningOverride: 'low' }),
    });
    expect(patch.status).toBe(204);

    const get = await app.request(`/api/v1/conversations/${CONV_ID}`);
    const body = (await get.json()) as { reasoningOverride: string | null };
    expect(body.reasoningOverride).toBe('low');
  });

  test('a corrupt messages row in real SQLite fails soft to empty messages on GET /:id', async () => {
    const db: AnvikaDbWithClient = createDb(':memory:');
    runMigrations(db);
    const store = new DrizzleMultiConversationStore(db);
    // Seed a real row, then overwrite its messages column with structurally-invalid JSON (valid JSON,
    // not UIMessages) via raw SQL. The read route's safeValidateUIMessages must reject it and serve
    // empty messages while preserving the title/revision (trust boundary).
    await store.saveTurn('local', CONV_ID, userOnly);
    db.$client.run(`UPDATE conversation SET messages = '[{"nope":true}]' WHERE id = '${CONV_ID}'`);

    const app = makeApp(store);
    const get = await app.request(`/api/v1/conversations/${CONV_ID}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });

  test('a non-array messages column fails soft to empty and logs the discard warning', async () => {
    const db: AnvikaDbWithClient = createDb(':memory:');
    runMigrations(db);
    const store = new DrizzleMultiConversationStore(db);
    // Seed a real row, then overwrite messages with a NON-array (a JSON object). safeValidateUIMessages
    // must reject it; the route serves empty messages and emits the content-safe discard warning.
    await store.saveTurn('local', CONV_ID, userOnly);
    db.$client.run(
      `UPDATE conversation SET messages = '{"parts":"INVALID"}' WHERE id = '${CONV_ID}'`,
    );

    const warnSpy = spyOn(serverLogger('conversation'), 'warn');
    const app = makeApp(store);
    const get = await app.request(`/api/v1/conversations/${CONV_ID}`);
    expect(get.status).toBe(200);
    const body = (await get.json()) as { messages: unknown[]; title: string };
    expect(body.messages).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    const calls = warnSpy.mock.calls as unknown as [string, Record<string, unknown>?][];
    expect(calls[0]?.[0]).toBe('discarding unparseable persisted conversation');
    warnSpy.mockRestore();
  });

  test('a saved turn appears in the list and as the defensively-resolved active conversation', async () => {
    const db = createDb(':memory:');
    runMigrations(db);
    const store = new DrizzleMultiConversationStore(db);
    await store.saveTurn('local', CONV_ID, userOnly);
    const app = makeApp(store);

    const get = await app.request('/api/v1/conversations');
    const body = (await get.json()) as {
      conversations: { id: string }[];
      activeId: string | null;
    };
    expect(body.conversations.map((c) => c.id)).toContain(CONV_ID);
    // No stored active pointer yet; the read route defensively serves the most-recent conversation.
    expect(body.activeId).toBe(CONV_ID);
  });
});
