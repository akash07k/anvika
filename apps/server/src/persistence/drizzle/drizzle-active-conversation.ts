import { eq } from 'drizzle-orm';

import type { AnvikaDb } from './connection';
import { appStateTable } from './schema';
import { nowSeconds } from './time';

/**
 * Read/write model for the per-owner active-conversation pointer stored in `app_state`. Kept as a
 * small dedicated module: the pointer concerns session state, not the conversation table, so it
 * does not belong in the read/write conversation modules.
 */
export class DrizzleActiveConversation {
  /** @param db - The typed Drizzle database handle. */
  constructor(private readonly db: AnvikaDb) {}

  /**
   * Read the owner's last-active conversation id from `app_state`, or `null` when the row is
   * absent or the column is null.
   *
   * @param owner - The conversation owner.
   * @returns The stored conversation id, or `null`.
   */
  async getActiveId(owner: string): Promise<string | null> {
    const rows = await this.db
      .select({ id: appStateTable.lastActiveConversationId })
      .from(appStateTable)
      .where(eq(appStateTable.owner, owner))
      .limit(1);
    return rows[0]?.id ?? null;
  }

  /**
   * Upsert the owner's last-active conversation pointer. Sets `last_active_conversation_id` and
   * refreshes `updated_at`; uses `onConflictDoUpdate` on the `owner` PK so a missing row is
   * created and an existing one is overwritten atomically. Accepts `null` to clear the pointer.
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id to store, or `null` to clear.
   */
  async setActiveId(owner: string, id: string | null): Promise<void> {
    const now = nowSeconds();
    await this.db
      .insert(appStateTable)
      .values({ owner, lastActiveConversationId: id, updatedAt: now })
      .onConflictDoUpdate({
        target: appStateTable.owner,
        set: { lastActiveConversationId: id, updatedAt: now },
      });
  }
}
