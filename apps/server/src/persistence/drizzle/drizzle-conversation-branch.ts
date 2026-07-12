import { and, eq } from 'drizzle-orm';
import type { UIMessage } from 'ai';

import {
  deriveConversationTitle,
  MAX_STORED_TITLE_LENGTH,
} from '@anvika/shared/conversation/title';

import { FALLBACK_CONVERSATION_TITLE } from './drizzle-conversation-read';
import type { BranchResult } from '../ports';
import type { AnvikaDb } from './connection';
import { conversationTable } from './schema';
import { nowSeconds } from './time';

/**
 * Build the branched row's title. When `prefix` is the WHOLE source transcript (an undefined
 * `throughIndex`) the title is `Branch of <source title>` - falling back to the untitled label
 * when the stored source title is empty - capped at {@link MAX_STORED_TITLE_LENGTH}. When a
 * `throughIndex` was given the title is freshly derived from the copied prefix instead.
 *
 * @param sourceTitle - The source's stored title.
 * @param prefix - The copied message prefix.
 * @param wholeTranscript - True when ALL messages were copied (no `throughIndex`).
 * @returns The new conversation's title.
 */
function branchTitle(
  sourceTitle: string,
  prefix: readonly UIMessage[],
  wholeTranscript: boolean,
): string {
  if (!wholeTranscript) return deriveConversationTitle(prefix);
  const base = sourceTitle === '' ? FALLBACK_CONVERSATION_TITLE : sourceTitle;
  return `Branch of ${base}`.slice(0, MAX_STORED_TITLE_LENGTH);
}

/**
 * The id-keyed BRANCH model over the conversation table: it forks an existing conversation into a
 * brand-new row, copying a message prefix and the source lineage. Kept separate from the
 * read/write models per the single-responsibility split, since the branch is a distinct
 * read-validate-insert transaction with its own conflict surface.
 */
export class DrizzleConversationBranch {
  /** @param db - The typed Drizzle database handle. */
  constructor(private readonly db: AnvikaDb) {}

  /**
   * Branch `(owner, sourceId)` into a brand-new `newId` row. See
   * {@link MultiConversationStore.branch} for the full contract. Transactional: it reads the source,
   * validates collision/index/revision, slices the prefix, and inserts the new row atomically so a
   * concurrent writer cannot interleave between the read and the insert.
   *
   * @param owner - The conversation owner (both rows are owner-scoped).
   * @param sourceId - The source conversation to branch from.
   * @param newId - The brand-new conversation id to create.
   * @param throughIndex - The inclusive last message index to copy, or undefined to copy all.
   * @param baseRevision - The source revision the caller based this branch on.
   * @returns The branch outcome.
   */
  async branch(
    owner: string,
    sourceId: string,
    newId: string,
    throughIndex: number | undefined,
    baseRevision: number,
  ): Promise<BranchResult> {
    return this.db.transaction((tx): BranchResult => {
      const source = tx
        .select({
          revision: conversationTable.revision,
          title: conversationTable.title,
          messages: conversationTable.messages,
          reasoningOverride: conversationTable.reasoningOverride,
        })
        .from(conversationTable)
        .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, sourceId)))
        .limit(1)
        .all()[0];
      if (source === undefined) return { ok: false, reason: 'not-found' };
      if (baseRevision !== source.revision) {
        return { ok: false, reason: 'conflict', currentRevision: source.revision };
      }
      if (throughIndex !== undefined && throughIndex >= source.messages.length) {
        return { ok: false, reason: 'bad-index' };
      }
      const collision = tx
        .select({ id: conversationTable.id })
        .from(conversationTable)
        .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, newId)))
        .limit(1)
        .all()[0];
      if (collision !== undefined) return { ok: false, reason: 'collision' };

      const prefix =
        throughIndex === undefined ? source.messages : source.messages.slice(0, throughIndex + 1);
      const title = branchTitle(source.title, prefix, throughIndex === undefined);
      const now = nowSeconds();
      tx.insert(conversationTable)
        .values({
          id: newId,
          owner,
          title,
          messages: prefix,
          reasoningOverride: source.reasoningOverride,
          pinnedAt: null,
          forkedFromId: sourceId,
          forkedFromMessageId: prefix.at(-1)?.id ?? null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      return {
        ok: true,
        summary: { id: newId, title, updatedAt: now, pinnedAt: null, revision: 1 },
      };
    });
  }
}
