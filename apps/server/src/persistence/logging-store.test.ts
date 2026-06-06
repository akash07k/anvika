import type { UIMessage } from 'ai';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  ActiveConversationStore,
  BranchResult,
  ConversationDetail,
  ConversationSummary,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SaveResult,
  SettingsStore,
  StoredSettings,
} from './ports';
import { captureServerLogs } from '../logging/log-capture';
import { withSettingsStoreLogging } from './logging-store';
import { withMultiConversationStoreLogging } from './multi-conversation-logging-store';

let teardown: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (teardown) await teardown();
  teardown = undefined;
});

const msgs: UIMessage[] = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

describe('withSettingsStoreLogging', () => {
  it('logs version and a bytes size on save (never the data)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const data = { theme: 'x', model: 'y' };
    const inner: SettingsStore = { load: async () => null, save: async () => {} };
    const store = withSettingsStoreLogging(inner);
    await store.save('local', data, 3);
    const record = capture.records.find((r) => String(r.message).includes('save'));
    expect(record?.level).toBe('info');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      version: 3,
      bytes: JSON.stringify(data).length,
    });
    expect(JSON.stringify(record?.properties)).not.toContain('theme');
  });

  it('logs found and version on a successful load', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const stored: StoredSettings = { data: { a: 1 }, version: 2 };
    const store = withSettingsStoreLogging({ load: async () => stored, save: async () => {} });
    const result = await store.load('local');
    expect(result).toBe(stored);
    const record = capture.records.find((r) => String(r.message).includes('load'));
    expect(record?.properties).toMatchObject({ owner: 'local', found: true, version: 2 });
  });

  it('logs an error and re-raises when settings load fails', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const boom = new Error('settings db down');
    const store = withSettingsStoreLogging({
      load: async () => {
        throw boom;
      },
      save: async () => {},
    });
    await expect(store.load('local')).rejects.toBe(boom);
    const record = capture.records.find((r) => r.level === 'error');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      message: 'Error: settings db down',
    });
  });

  it('logs an error and re-raises when settings save fails', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const boom = new Error('settings write failed');
    const store = withSettingsStoreLogging({
      load: async () => null,
      save: async () => {
        throw boom;
      },
    });
    await expect(store.save('local', { a: 1 }, 4)).rejects.toBe(boom);
    const record = capture.records.find((r) => r.level === 'error');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      version: 4,
      message: 'Error: settings write failed',
    });
  });
});

// ---------------------------------------------------------------------------
// Fake multi-conversation store used by withMultiConversationStoreLogging tests
// ---------------------------------------------------------------------------

const detail: ConversationDetail = {
  messages: [
    { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
    { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'world' }] },
  ],
  title: 'Secret title',
  reasoningOverride: null,
  modelId: null,
  revision: 3,
};

const summary: ConversationSummary = {
  id: 'id-1',
  title: 'Secret title',
  updatedAt: 0,
  pinnedAt: null,
  revision: 3,
};

function makeMultiStore(
  overrides: Partial<
    MultiConversationStore &
      IdReasoningOverrideStore &
      IdModelOverrideStore &
      ActiveConversationStore
  > = {},
): MultiConversationStore &
  IdReasoningOverrideStore &
  IdModelOverrideStore &
  ActiveConversationStore {
  return {
    list: async () => [summary],
    load: async () => detail,
    saveTurn: async () => ({ ok: true, revision: 4 }) as SaveResult,
    rename: async () => {},
    setPinned: async () => true,
    branch: async () => ({ ok: false, reason: 'not-found' }),
    delete: async () => {},
    deleteMany: async () => {},
    healMessages: async () => {},
    getReasoningOverride: async () => null,
    setReasoningOverride: async () => {},
    getModelOverride: async () => null,
    setModelOverride: async () => {},
    getActiveId: async () => 'id-1',
    setActiveId: async () => {},
    ...overrides,
  };
}

describe('withMultiConversationStoreLogging', () => {
  it('logs a content-safe info on load hit (id, found, messageCount, revision, durationMs; no text/title)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(makeMultiStore());
    const result = await store.load('local', 'id-1');
    expect(result).toBe(detail);
    const record = capture.records.find((r) => String(r.message).includes('load'));
    expect(record?.level).toBe('info');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      id: 'id-1',
      found: true,
      messageCount: 2,
      revision: 3,
    });
    expect(typeof record?.properties.durationMs).toBe('number');
    // Must never log message text or title
    expect(JSON.stringify(record?.properties)).not.toContain('hello');
    expect(JSON.stringify(record?.properties)).not.toContain('Secret title');
  });

  it('logs found=false when load returns null', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(makeMultiStore({ load: async () => null }));
    await store.load('local', 'id-missing');
    const record = capture.records.find((r) => String(r.message).includes('load'));
    expect(record?.properties).toMatchObject({ found: false });
    expect(record?.properties).not.toHaveProperty('messageCount');
    expect(record?.properties).not.toHaveProperty('revision');
  });

  it('logs error and re-raises when load throws', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const boom = new Error('db down');
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        load: async () => {
          throw boom;
        },
      }),
    );
    await expect(store.load('local', 'id-1')).rejects.toBe(boom);
    const record = capture.records.find((r) => r.level === 'error');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      id: 'id-1',
      message: 'Error: db down',
    });
  });

  it('logs content-safe info on saveTurn success (ok, revision, messageCount; no message text)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(makeMultiStore());
    const result = await store.saveTurn('local', 'id-1', msgs, 3);
    expect(result).toEqual({ ok: true, revision: 4 });
    const record = capture.records.find((r) => String(r.message).includes('save turn'));
    expect(record?.level).toBe('info');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      id: 'id-1',
      messageCount: msgs.length,
      revision: 4,
      ok: true,
    });
    expect(typeof record?.properties.durationMs).toBe('number');
    expect(JSON.stringify(record?.properties)).not.toContain('hi');
  });

  it('logs conflict outcome content-safely when saveTurn returns ok=false', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const conflict: SaveResult = { ok: false, conflict: true, currentRevision: 7 };
    const store = withMultiConversationStoreLogging(
      makeMultiStore({ saveTurn: async () => conflict }),
    );
    const result = await store.saveTurn('local', 'id-1', msgs, 3);
    expect(result).toEqual(conflict);
    const record = capture.records.find((r) => String(r.message).includes('conflict'));
    expect(record?.level).toBe('info');
    expect(record?.properties).toMatchObject({
      ok: false,
      conflict: true,
      currentRevision: 7,
    });
  });

  it('logs error and re-raises when saveTurn throws', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const boom = new Error('write failed');
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        saveTurn: async () => {
          throw boom;
        },
      }),
    );
    await expect(store.saveTurn('local', 'id-1', msgs, 1)).rejects.toBe(boom);
    const record = capture.records.find((r) => r.level === 'error');
    expect(record?.properties).toMatchObject({
      owner: 'local',
      id: 'id-1',
      message: 'Error: write failed',
    });
    expect(JSON.stringify(record?.properties)).not.toContain('hi');
  });

  it('passes through rename without logging (route already logs it)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    let called = false;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        rename: async () => {
          called = true;
        },
      }),
    );
    await store.rename('local', 'id-1', 'New title');
    expect(called).toBe(true);
    expect(capture.records).toHaveLength(0);
  });

  it('passes through delete without logging (route already logs it)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    let called = false;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        delete: async () => {
          called = true;
        },
      }),
    );
    await store.delete('local', 'id-1');
    expect(called).toBe(true);
    expect(capture.records).toHaveLength(0);
  });

  it('passes through branch without logging (route already logs success and failure)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const branched: BranchResult = {
      ok: true,
      summary: { id: 'new-1', title: 'Branch of x', updatedAt: 0, pinnedAt: null, revision: 1 },
    };
    let called = false;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        branch: async () => {
          called = true;
          return branched;
        },
      }),
    );
    const result = await store.branch('local', 'id-1', 'new-1', undefined, 3);
    expect(called).toBe(true);
    expect(result).toBe(branched);
    expect(capture.records).toHaveLength(0);
  });

  it('passes through getReasoningOverride without logging (noisy per-turn read)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({ getReasoningOverride: async () => 'low' }),
    );
    const val = await store.getReasoningOverride('local', 'id-1');
    expect(val).toBe('low');
    expect(capture.records).toHaveLength(0);
  });

  it('passes through getModelOverride without logging (noisy per-turn read)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({ getModelOverride: async () => 'openai:gpt-4o' }),
    );
    const val = await store.getModelOverride('local', 'id-1');
    expect(val).toBe('openai:gpt-4o');
    expect(capture.records).toHaveLength(0);
  });

  it('passes through setModelOverride without logging (logged at the route level)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    let called = false;
    const store = withMultiConversationStoreLogging(
      makeMultiStore({
        setModelOverride: async () => {
          called = true;
        },
      }),
    );
    await store.setModelOverride('local', 'id-1', 'openai:gpt-4o');
    expect(called).toBe(true);
    expect(capture.records).toHaveLength(0);
  });

  it('faithfully delegates return values (list, getActiveId)', async () => {
    const capture = await captureServerLogs();
    teardown = capture.teardown;
    const store = withMultiConversationStoreLogging(makeMultiStore());
    const list = await store.list('local');
    expect(list).toEqual([summary]);
    const activeId = await store.getActiveId('local');
    expect(activeId).toBe('id-1');
  });
});
