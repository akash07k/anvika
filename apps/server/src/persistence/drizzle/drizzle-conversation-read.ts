import { and, desc, eq } from 'drizzle-orm';

import { ReasoningEffortSchema, type ReasoningEffort } from '@anvika/shared/reasoning/effort';

import { serverLogger } from '../../logging/logger';
import type { ConversationDetail, ConversationSummary } from '../ports';
import type { AnvikaDb } from './connection';
import { conversationTable } from './schema';

/**
 * The safe title shown when a stored title is corrupt: non-string, or over the length cap. Read
 * is a trust boundary (DB text column), so a malformed title fails soft to this constant rather
 * than rendering garbage or an unbounded string in the conversation nav.
 */
export const FALLBACK_CONVERSATION_TITLE = 'Untitled conversation';

/** Upper bound on a stored title's length on read; longer values are treated as corrupt. */
const MAX_STORED_TITLE_LENGTH = 200;

/**
 * Coerce a stored title to a safe value. A non-string or over-long title (a corrupt or
 * schema-evolved column) becomes {@link FALLBACK_CONVERSATION_TITLE}. The title is never logged.
 *
 * @param stored - The raw stored title column value.
 * @returns A safe, bounded title string.
 */
function safeTitle(stored: unknown): string {
  if (typeof stored !== 'string' || stored.length > MAX_STORED_TITLE_LENGTH) {
    return FALLBACK_CONVERSATION_TITLE;
  }
  return stored;
}

/**
 * Validate a stored reasoning-override column on read. A non-null value that fails the effort
 * enum is a corrupt or legacy column: it fails soft to `null` (inherit) with a content-safe warn
 * (owner only, never the invalid value), mirroring the owner-keyed store's fail-soft.
 *
 * @param owner - The conversation owner (logged as content-safe metadata).
 * @param stored - The raw stored `reasoning_override` value.
 * @returns The validated effort, or `null` to inherit.
 */
function safeReasoningOverride(owner: string, stored: unknown): ReasoningEffort | null {
  const parsed = ReasoningEffortSchema.safeParse(stored);
  if (!parsed.success && stored !== null) {
    serverLogger('conversation').warning('reasoning_override column value invalid; inheriting', {
      owner,
    });
  }
  return parsed.success ? parsed.data : null;
}

/**
 * Validate a stored model-id column on read. A non-null value that is not a string is corrupt and
 * fails soft to `null` (inherit) with a content-safe warn (owner only, never the invalid value). An
 * empty string also fails soft to `null` (the write boundary rejects empty, so a stored `''` is a
 * legacy/corrupt value that means inherit, never an unresolvable empty model id). A non-empty stored
 * string is returned verbatim - a model id is an opaque string here, exactly as
 * `ChatRequestSchema.modelId` and the settings `selectedModelId` treat it; whether it resolves to a
 * configured connection is decided downstream and surfaced as the recoverable `model-unavailable`
 * readiness state, so an unresolvable override is never silently swapped for the default on read.
 *
 * @param owner - The conversation owner (logged as content-safe metadata).
 * @param stored - The raw stored `model_id` value.
 * @returns The validated model id, or `null` to inherit.
 */
function safeModelId(owner: string, stored: unknown): string | null {
  if (stored === null) return null;
  if (typeof stored === 'string') return stored === '' ? null : stored;
  serverLogger('conversation').warning('model_id column value invalid; inheriting', {
    owner,
  });
  return null;
}

/**
 * The id-keyed READ model over the conversation table: the owner-scoped `list` and the
 * `(owner, id)` `load`. Both apply fail-soft validation at the DB read trust boundary (title,
 * reasoning override, and model id). Kept separate from the WRITE model per the single-responsibility
 * split.
 */
export class DrizzleConversationRead {
  /** @param db - The typed Drizzle database handle. */
  constructor(private readonly db: AnvikaDb) {}

  /**
   * List the owner's conversations as lightweight summaries, most-recently-updated first.
   *
   * @param owner - The conversation owner.
   * @returns The summaries ordered by `updatedAt` descending (empty when the owner has none).
   */
  async list(owner: string): Promise<ConversationSummary[]> {
    const rows = await this.db
      .select({
        id: conversationTable.id,
        title: conversationTable.title,
        updatedAt: conversationTable.updatedAt,
        pinnedAt: conversationTable.pinnedAt,
        revision: conversationTable.revision,
      })
      .from(conversationTable)
      .where(eq(conversationTable.owner, owner))
      .orderBy(desc(conversationTable.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      title: safeTitle(r.title),
      updatedAt: r.updatedAt,
      pinnedAt: r.pinnedAt,
      revision: r.revision,
    }));
  }

  /**
   * Load the full detail for the owner's conversation `id`, or `null` when absent. Applies the
   * title, reasoning-override, and model-id fail-soft; `messages` is returned verbatim (the
   * conversation route validates it against `safeValidateUIMessages` at its boundary).
   *
   * @param owner - The conversation owner.
   * @param id - The conversation id.
   * @returns The detail, or `null` on miss.
   */
  async load(owner: string, id: string): Promise<ConversationDetail | null> {
    const rows = await this.db
      .select()
      .from(conversationTable)
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      messages: row.messages,
      title: safeTitle(row.title),
      reasoningOverride: safeReasoningOverride(owner, row.reasoningOverride),
      modelId: safeModelId(owner, row.modelId),
      revision: row.revision,
    };
  }

  /**
   * Read the per-conversation reasoning-effort override for `(owner, id)`. The stored TEXT is a
   * trust boundary on read-back: validated against the effort enum, failing soft to `null` (inherit)
   * for a NULL, legacy, or schema-evolved value. No row returns `null` (silent miss, not an error).
   *
   * @param owner - The conversation owner (logged as content-safe metadata on corrupt value).
   * @param id - The conversation id.
   * @returns The stored effort, or `null` to inherit.
   */
  async getReasoningOverride(owner: string, id: string): Promise<ReasoningEffort | null> {
    const rows = await this.db
      .select({ reasoningOverride: conversationTable.reasoningOverride })
      .from(conversationTable)
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
      .limit(1);
    if (rows[0] === undefined) return null;
    return safeReasoningOverride(owner, rows[0].reasoningOverride);
  }

  /**
   * Read the per-conversation model-id override for `(owner, id)`. The stored TEXT column is a
   * trust boundary on read-back: a non-null, non-string value fails soft to `null` (inherit) via
   * {@link safeModelId}; a stored string is returned verbatim (an opaque model id - resolvability is
   * decided downstream and surfaced as the recoverable `model-unavailable` readiness state). The
   * stored value itself is never logged. No row returns `null` (a silent miss, not an error).
   *
   * @param owner - The conversation owner (logged as content-safe metadata on corrupt value).
   * @param id - The conversation id.
   * @returns The stored model id, or `null` to inherit.
   */
  async getModelOverride(owner: string, id: string): Promise<string | null> {
    const rows = await this.db
      .select({ modelId: conversationTable.modelId })
      .from(conversationTable)
      .where(and(eq(conversationTable.owner, owner), eq(conversationTable.id, id)))
      .limit(1);
    if (rows[0] === undefined) return null;
    return safeModelId(owner, rows[0].modelId);
  }
}
