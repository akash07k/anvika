import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import { persistConversationTurnById } from '../chat/conversation-persistence';
import type { ChatTurnOutcome } from '../chat/conversation-outcome';
import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
} from '../persistence/ports';

/** The persistence target a single chat request resolves to before streaming. */
export interface ChatPersistenceTarget {
  /** Finished-turn callback handed to `streamChat`, or `undefined` when the turn is ephemeral. */
  onTurnFinish: ((outcome: ChatTurnOutcome) => Promise<void>) | undefined;
  /**
   * True only when a pre-flight optimistic-concurrency check found the target conversation's stored
   * revision no longer matches the request's `baseRevision`. The route must 409 BEFORE resolving the
   * model or starting any stream, so this is computed up front.
   */
  conflict: boolean;
}

/**
 * Mark `conversationId` the owner's active pointer, best-effort. A pointer write is non-critical
 * session state: if it fails, the turn already persisted, so we log a content-safe warning (only the
 * id crosses the boundary, never message text or title) and swallow it rather than fail the turn.
 *
 * @param activeStore - The active-pointer store, or `undefined` when not wired (the pointer is a no-op).
 * @param conversationId - The conversation the finished turn was persisted to.
 */
async function markActive(
  activeStore: ActiveConversationStore | undefined,
  conversationId: string,
): Promise<void> {
  if (!activeStore) return;
  try {
    await activeStore.setActiveId(OWNER_LOCAL, conversationId);
  } catch (err) {
    serverLogger('chat').warning('could not update the active-conversation pointer after a turn', {
      conversationId,
      message: String(err),
    });
  }
}

/**
 * Resolve where ONE chat request persists, capturing the request's `conversationId`/`baseRevision`
 * (so the returned `onTurnFinish` closes over THIS request). When a `conversationId` targets the
 * id-keyed store, the finished turn persists via `saveTurn` under optimistic concurrency and a
 * pre-flight `load` flags a stale `baseRevision` as a `conflict`; otherwise the turn is ephemeral. A
 * `baseRevision` with no `conversationId`, or with no stored row (a first send for a new id), is
 * never a conflict.
 *
 * Once the turn persists, the conversation is marked the active pointer (via `activeStore`) so a
 * page reload or full server restart restores the conversation the user just chatted in, rather than
 * a stale previously-active one (the entry route prefers the stored pointer over most-recent). The
 * pointer is set only when a row actually exists (never a dangling draft id) and best-effort: a
 * pointer-write failure is logged content-safe and swallowed so it can never fail an already-saved
 * turn.
 *
 * @param input - The request's persistence inputs, the injected id-keyed store, and the active
 *   pointer store (the same composed store in production).
 * @returns The finished-turn callback plus whether the pre-flight check found a conflict.
 */
export async function resolveChatPersistenceTarget(input: {
  conversationId: string | undefined;
  baseRevision: number | undefined;
  multiConversationStore: MultiConversationStore | undefined;
  activeStore: ActiveConversationStore | undefined;
}): Promise<ChatPersistenceTarget> {
  const { conversationId, baseRevision, multiConversationStore, activeStore } = input;

  if (conversationId && multiConversationStore) {
    const onTurnFinish = async (outcome: ChatTurnOutcome): Promise<void> => {
      const persisted = await persistConversationTurnById(
        multiConversationStore,
        OWNER_LOCAL,
        conversationId,
        outcome,
        baseRevision,
      );
      if (persisted) await markActive(activeStore, conversationId);
    };
    // A missing row is a first send for a new id (no conflict; saveTurn will create it); an absent
    // baseRevision is the very first send and carries no token to compare.
    if (baseRevision !== undefined) {
      const detail = await multiConversationStore.load(OWNER_LOCAL, conversationId);
      if (detail !== null && detail.revision !== baseRevision) {
        return { onTurnFinish, conflict: true };
      }
    }
    return { onTurnFinish, conflict: false };
  }

  return { onTurnFinish: undefined, conflict: false };
}

/**
 * Read the per-conversation reasoning-effort override for the effort cascade. When the request
 * carries a `conversationId` and the id-keyed port is injected, read it by `(owner, conversationId)`;
 * absent either, return `null` so the cascade falls through to the connection/global effort.
 *
 * @param input - The request's `conversationId` plus the id-keyed override port.
 * @returns The stored effort, or `null` to inherit.
 */
export async function readReasoningOverride(input: {
  conversationId: string | undefined;
  idReasoningOverrideStore: IdReasoningOverrideStore | undefined;
}): Promise<ReasoningEffort | null> {
  const { conversationId, idReasoningOverrideStore } = input;
  if (conversationId && idReasoningOverrideStore) {
    return idReasoningOverrideStore.getReasoningOverride(OWNER_LOCAL, conversationId);
  }
  return null;
}

/**
 * Read the per-conversation model-id override that authoritatively selects the turn's model (mirroring
 * {@link readReasoningOverride}). When the request carries a `conversationId` and the id-keyed port is
 * injected, read it by `(owner, conversationId)`; absent either, return `null` so the caller falls back
 * to the request-body model id and then the settings default. The DB is the source of truth here, so an
 * override set in another tab - or a client whose optimistic value briefly reverted - still selects the
 * persisted model for the turn.
 *
 * @param input - The request's `conversationId` plus the id-keyed model-override port.
 * @returns The stored model id, or `null` to fall back to the request/settings default.
 */
export async function readModelOverride(input: {
  conversationId: string | undefined;
  idModelOverrideStore: IdModelOverrideStore | undefined;
}): Promise<string | null> {
  const { conversationId, idModelOverrideStore } = input;
  if (conversationId && idModelOverrideStore) {
    return idModelOverrideStore.getModelOverride(OWNER_LOCAL, conversationId);
  }
  return null;
}
