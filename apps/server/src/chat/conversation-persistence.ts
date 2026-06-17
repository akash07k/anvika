import { generateId } from 'ai';
import type { UIMessage } from 'ai';

import { ensureMessageIds } from './ensure-message-ids';
import { assistantTurnHasContent, markIncompleteTurn } from './incomplete-turn';
import { serverLogger } from '../logging/logger';
import type { MultiConversationStore } from '../persistence/ports';
import type { ChatTurnOutcome } from './conversation-outcome';

/**
 * Apply the save policy for one finished turn (the completed/error/aborted message selection via
 * {@link turnMessagesToPersist}), persisting through the id-keyed
 * {@link MultiConversationStore.saveTurn} under optimistic
 * concurrency. A brand-new `id` creates the row (derived title, revision 1); an existing one bumps
 * `revision` from `baseRevision`. On a POST-stream conflict - the rare race where the row moved
 * between the route's pre-flight check and this persist - log a content-safe warning (ids and
 * revisions only, never message text or title) and return WITHOUT throwing, so a draining stream is
 * never failed by a lost write.
 *
 * @param store - The id-keyed multi-conversation store port.
 * @param owner - The conversation owner.
 * @param id - The target conversation id (short `xxx-xxx` form).
 * @param outcome - The mapped turn outcome carrying both message lists.
 * @param baseRevision - The optimistic-concurrency token the turn was based on, or `undefined` on a
 *   first send.
 * @param newId - Unique-id generator for blank ids; defaults to the `ai` `generateId`.
 * @returns `true` when a `saveTurn` was attempted (a row for `id` now exists, whether the write
 *   created it, bumped it, or lost a save-time conflict to a concurrent writer); `false` when the
 *   empty-turn rule persisted nothing (so the conversation may not exist). The caller uses this to
 *   point the active-conversation pointer only at a conversation that exists, never a dangling id.
 */
export async function persistConversationTurnById(
  store: MultiConversationStore,
  owner: string,
  id: string,
  outcome: ChatTurnOutcome,
  baseRevision: number | undefined,
  newId: () => string = generateId,
): Promise<boolean> {
  const messages = turnMessagesToPersist(outcome, newId);
  if (messages === null) {
    return false;
  }
  const result = await store.saveTurn(owner, id, messages, baseRevision);
  if (!result.ok) {
    // Content-safe: only ids and revisions cross the log boundary, never message text or title.
    serverLogger('chat').warning('conversation turn lost a save-time conflict; not persisted', {
      owner,
      id,
      baseRevision,
      currentRevision: result.currentRevision,
    });
  }
  // The row exists either way (created/bumped on success, or pre-existing on a save-time conflict).
  return true;
}

/**
 * Apply the shared save policy for one finished turn: choose WHICH messages to persist, with any
 * blank/missing id backfilled (via {@link ensureMessageIds}). `completed` persists the full turn;
 * `error`/`aborted` persist the partial assistant turn (marked, model-stamped) when it has content,
 * else `error` keeps the user turn and `aborted` keeps nothing. Returns `null` when nothing should
 * be persisted (the empty-turn rule). `persistConversationTurnById` uses this so the
 * policy has one home.
 *
 * @param outcome - The mapped turn outcome carrying both message lists.
 * @param newId - Unique-id generator for blank ids.
 * @returns The messages to persist, or `null` to persist nothing.
 */
function turnMessagesToPersist(outcome: ChatTurnOutcome, newId: () => string): UIMessage[] | null {
  if (outcome.status === 'completed') {
    return ensureMessageIds(outcome.finalMessages, newId);
  }
  // error/aborted: persist the partial, marked assistant turn when it has content; otherwise keep the
  // user turn on an error (reload-and-retry) and nothing on an abort (the empty-turn rule).
  if (assistantTurnHasContent(outcome.finalMessages)) {
    return ensureMessageIds(
      markIncompleteTurn(outcome.finalMessages, outcome.status, outcome.resolvedModelId),
      newId,
    );
  }
  return outcome.status === 'error' ? ensureMessageIds(outcome.incomingMessages, newId) : null;
}
