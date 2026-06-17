import type { UIMessage } from 'ai';

import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import { serverLogger } from '../logging/logger';
import type {
  ActiveConversationStore,
  BranchResult,
  ConversationDetail,
  ConversationSummary,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SaveResult,
} from './ports';

/** The default category segments for the persistence layer (`anvika.server.persistence`). */
const DEFAULT_CATEGORY = ['persistence'] as const;

/**
 * The combined interface the composition root injects (same intersection that `createApp` accepts).
 * The decorator must satisfy all four ports so it can be passed wherever the raw store is used.
 */
type MultiStore = MultiConversationStore &
  IdReasoningOverrideStore &
  IdModelOverrideStore &
  ActiveConversationStore;

/**
 * Wrap a {@link MultiStore} so `load` and `saveTurn` log content-safe outcome metadata at `info`
 * (and `error` on failure) with `durationMs` - never message text, titles, or override values.
 *
 * Route-level mutations (rename, delete, deleteMany, setActive, setReasoningOverride) are ALREADY
 * logged at the route and are passed straight through to avoid double-logging. Noisy per-turn reads
 * (getReasoningOverride, getActiveId) are also passed through unlogged.
 *
 * @param store - The real multi-conversation store to wrap.
 * @param category - Category segments under `anvika.server`; defaults to `['persistence']`.
 * @returns A {@link MultiStore} that logs around load and saveTurn.
 */
export function withMultiConversationStoreLogging(
  store: MultiStore,
  category: readonly string[] = DEFAULT_CATEGORY,
): MultiStore {
  const log = serverLogger(...category);

  return {
    // ---- MultiConversationStore ----

    list(owner: string): Promise<ConversationSummary[]> {
      return store.list(owner);
    },

    async load(owner: string, id: string): Promise<ConversationDetail | null> {
      const start = Date.now();
      try {
        const detail = await store.load(owner, id);
        log.info('multi conversation load', {
          owner,
          id,
          found: detail !== null,
          ...(detail !== null
            ? { messageCount: detail.messages.length, revision: detail.revision }
            : {}),
          durationMs: Date.now() - start,
        });
        return detail;
      } catch (err) {
        log.error('multi conversation load failed', {
          owner,
          id,
          durationMs: Date.now() - start,
          message: String(err),
        });
        throw err;
      }
    },

    async saveTurn(
      owner: string,
      id: string,
      messages: UIMessage[],
      baseRevision?: number,
    ): Promise<SaveResult> {
      const start = Date.now();
      try {
        const result = await store.saveTurn(owner, id, messages, baseRevision);
        if (result.ok) {
          log.info('multi conversation save turn', {
            owner,
            id,
            messageCount: messages.length,
            revision: result.revision,
            ok: true,
            durationMs: Date.now() - start,
          });
        } else {
          log.info('multi conversation save turn conflict', {
            owner,
            id,
            ok: false,
            conflict: true,
            currentRevision: result.currentRevision,
            durationMs: Date.now() - start,
          });
        }
        return result;
      } catch (err) {
        log.error('multi conversation save turn failed', {
          owner,
          id,
          durationMs: Date.now() - start,
          message: String(err),
        });
        throw err;
      }
    },

    /** Pass-through: rename is already logged at the route level. */
    rename(owner: string, id: string, title: string): Promise<void> {
      return store.rename(owner, id, title);
    },

    /** Pass-through: setPinned is already logged at the route level. */
    setPinned(owner: string, id: string, pinned: boolean): Promise<boolean> {
      return store.setPinned(owner, id, pinned);
    },

    /** Pass-through: branch is already logged at the route level (success and failure). */
    branch(
      owner: string,
      sourceId: string,
      newId: string,
      throughIndex: number | undefined,
      baseRevision: number,
    ): Promise<BranchResult> {
      return store.branch(owner, sourceId, newId, throughIndex, baseRevision);
    },

    /** Pass-through: delete is already logged at the route level. */
    delete(owner: string, id: string): Promise<void> {
      return store.delete(owner, id);
    },

    /** Pass-through: deleteMany is already logged at the route level. */
    deleteMany(owner: string, ids: string[]): Promise<void> {
      return store.deleteMany(owner, ids);
    },

    async healMessages(owner: string, id: string, messages: UIMessage[]): Promise<void> {
      // Logged here (content-safe metadata only); the route logs a heal-write FAILURE on its catch.
      await store.healMessages(owner, id, messages);
      log.info('multi conversation heal messages', {
        owner,
        id,
        messageCount: messages.length,
      });
    },

    // ---- IdReasoningOverrideStore ----

    /** Pass-through: getReasoningOverride is a noisy per-turn read; logged at the route on set. */
    getReasoningOverride(owner: string, id: string): Promise<ReasoningEffort | null> {
      return store.getReasoningOverride(owner, id);
    },

    /** Pass-through: setReasoningOverride is already logged at the route level. */
    setReasoningOverride(owner: string, id: string, value: ReasoningEffort | null): Promise<void> {
      return store.setReasoningOverride(owner, id, value);
    },

    // ---- IdModelOverrideStore ----

    /** Pass-through: getModelOverride is a noisy per-turn read; logged at the route on set. */
    getModelOverride(owner: string, id: string): Promise<string | null> {
      return store.getModelOverride(owner, id);
    },

    /** Pass-through: setModelOverride is already logged at the route level. */
    setModelOverride(owner: string, id: string, value: string | null): Promise<void> {
      return store.setModelOverride(owner, id, value);
    },

    // ---- ActiveConversationStore ----

    /** Pass-through: getActiveId is a noisy per-request read; setActive is logged at the route. */
    getActiveId(owner: string): Promise<string | null> {
      return store.getActiveId(owner);
    },

    /** Pass-through: setActiveId is triggered by the route (set-active, delete) which logs it. */
    setActiveId(owner: string, id: string | null): Promise<void> {
      return store.setActiveId(owner, id);
    },
  };
}
