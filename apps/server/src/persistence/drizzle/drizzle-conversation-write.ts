import { and, eq, inArray } from 'drizzle-orm';
import type { UIMessage } from 'ai';

import { deriveConversationTitle, NEW_CONVERSATION_TITLE } from '@anvika/shared/conversation/title';
import type { ReasoningEffort } from '@anvika/shared/reasoning/effort';

import type { SaveResult } from '../ports';
import type { AnvikaDb } from './connection';
import { conversationTable } from './schema';
import { nowSeconds } from './time';

/**
 * The id-keyed WRITE model over the conversation table: the conditional `saveTurn` plus
 * `rename`, `delete`, `deleteMany`, and `healMessages`. `revision` and `updated_at` bump ONLY in
 * `saveTurn` (the concurrency token and recency); `rename` and `healMessages` deliberately touch
 * neither, so a retitle or transcript heal never reorders the list nor spends the conflict token.
 * Kept separate from the READ model per the single-responsibility split.
 */
export class DrizzleConversationWrite {
  /** @param db - The typed Drizzle database handle. */
  constructor(private readonly db: AnvikaDb) {}

  /**
   * Persist a turn for `(owner, id)` under optimistic concurrency. Transactional: it reads the
   * row, then creates, conflicts, or updates atomically. Absent row: insert with a derived title,
   * `revision = 1`, fresh timestamps, returning `{ ok: true, revision: 1 }`. Empty `messages` on an
   * EXISTING row is the override routes' create-if-absent probe (a real turn always carries
   * messages): it is an atomic no-op that returns the stored revision WITHOUT clobbering messages or
   * bumping the revision, so a concurrent real `saveTurn` can never lose its messages to a late empty
   * probe. Present with a `baseRevision` that mismatches the stored revision: return a conflict and
   * leave the row untouched. Otherwise: replace `messages`, bump `revision`, refresh `updated_at`, and
   * re-derive the title ONLY when the row still carries the placeholder title (the first
   * content-bearing turn into a pre-created empty draft); otherwise the title is never
   * overwritten, so a user rename or an earlier derived title is preserved. Returns the new
   * revision.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param messages - The full conversation to persist.
   * @param baseRevision - The revision the caller based this turn on, for conflict detection.
   * @returns The save outcome (new revision on success, stored revision on conflict).
   */
  async saveTurn(
    owner: string,
    id: string,
    messages: UIMessage[],
    baseRevision?: number,
  ): Promise<SaveResult> {
    return this.db.transaction((tx): SaveResult => {
      const existing = tx
        .select({ revision: conversationTable.revision, title: conversationTable.title })
        .from(conversationTable)
        .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
        .limit(1)
        .all();
      const stored = existing[0];
      const now = nowSeconds();
      if (stored === undefined) {
        tx.insert(conversationTable)
          .values({
            id,
            owner,
            title: deriveConversationTitle(messages),
            messages,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        return { ok: true, revision: 1 };
      }
      // Empty messages on an existing row is a create-if-absent probe (override routes); the row is
      // already here, so do NOT clobber its messages or bump its revision - return it untouched. The
      // read + this decision run inside one transaction, so this is race-free against a concurrent
      // real turn (a late empty probe can never overwrite freshly-saved messages).
      if (messages.length === 0) {
        return { ok: true, revision: stored.revision };
      }
      if (baseRevision !== undefined && baseRevision !== stored.revision) {
        return { ok: false, conflict: true, currentRevision: stored.revision };
      }
      const nextRevision = stored.revision + 1;
      const nextTitle =
        stored.title === '' || stored.title === NEW_CONVERSATION_TITLE
          ? deriveConversationTitle(messages)
          : stored.title;
      tx.update(conversationTable)
        .set({ messages, title: nextTitle, revision: nextRevision, updatedAt: now })
        .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
        .run();
      return { ok: true, revision: nextRevision };
    });
  }

  /**
   * Set the title for `(owner, id)`. Updates the `title` column ONLY: it never bumps `revision`
   * and never refreshes `updated_at`, so a rename neither reorders the recency list nor spends the
   * optimistic-concurrency token.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param title - The new title.
   */
  async rename(owner: string, id: string, title: string): Promise<void> {
    await this.db
      .update(conversationTable)
      .set({ title })
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)));
  }

  /**
   * Set or clear the pin for `(owner, id)`. Writes the `pinned_at` column ONLY: now-seconds when
   * pinning, null when unpinning. It never bumps `revision` and never refreshes `updated_at`, so a
   * pin neither reorders the recency list nor spends the optimistic-concurrency token. A single
   * atomic UPDATE folds the existence check into the write - no separate read - so there is no
   * check-then-act race: when the row is absent zero rows change and it reports `false`.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param pinned - True to pin (now-seconds), false to unpin (null).
   * @returns `true` when a matching row was updated, `false` when none existed.
   */
  async setPinned(owner: string, id: string, pinned: boolean): Promise<boolean> {
    const updated = await this.db
      .update(conversationTable)
      .set({ pinnedAt: pinned ? nowSeconds() : null })
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
      .returning({ id: conversationTable.id });
    return updated.length > 0;
  }

  /**
   * Rewrite the `messages` JSON for `(owner, id)` after a heal-on-read of a partial or corrupt
   * transcript. Touches `messages` ONLY: no `revision` bump, no `updated_at` change, no title
   * change, so healing never falsifies the concurrency token nor reorders the list.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param messages - The healed conversation messages.
   */
  async healMessages(owner: string, id: string, messages: UIMessage[]): Promise<void> {
    await this.db
      .update(conversationTable)
      .set({ messages })
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)));
  }

  /**
   * Delete the `(owner, id)` conversation. A no-op when the row is absent or owned by another.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   */
  async delete(owner: string, id: string): Promise<void> {
    await this.db
      .delete(conversationTable)
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)));
  }

  /**
   * Delete every owner-scoped conversation whose id is in `ids`. An empty `ids` array is an
   * explicit no-op (guarded), since an empty `inArray` would issue a needless query.
   *
   * @param owner - The conversation owner.
   * @param ids - The conversation ids to delete (scoped to `owner`).
   */
  async deleteMany(owner: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .delete(conversationTable)
      .where(and(eq(conversationTable.owner, owner), inArray(conversationTable.id, ids)));
  }

  /**
   * Set (or clear with `null`) the per-conversation reasoning-effort override for `(owner, id)`.
   * A CONDITIONAL UPDATE: it writes `reasoning_override` ONLY on the matching row. It MUST NOT
   * bump `revision` or `updated_at`. It MUST NOT create a row: if no `(owner, id)` row
   * exists, zero rows are affected and the call is a silent no-op.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param value - The effort to store, or `null` to clear.
   */
  async setReasoningOverride(
    owner: string,
    id: string,
    value: ReasoningEffort | null,
  ): Promise<void> {
    await this.db
      .update(conversationTable)
      .set({ reasoningOverride: value })
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)));
  }

  /**
   * Set (or clear with `null`) the per-conversation model-id override for `(owner, id)`.
   * A CONDITIONAL UPDATE: it writes `model_id` ONLY on the matching row. It MUST NOT bump
   * `revision` or `updated_at`. It MUST NOT create a row: if no `(owner, id)` row
   * exists, zero rows are affected and the call is a silent no-op.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @param value - The model id to store, or `null` to clear.
   */
  async setModelOverride(owner: string, id: string, value: string | null): Promise<void> {
    await this.db
      .update(conversationTable)
      .set({ modelId: value })
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)));
  }
}
