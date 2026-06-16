import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { UIMessage } from 'ai';

/**
 * One row per conversation, keyed by a client-minted short `xxx-xxx` `id` and scoped by `owner`.
 * `messages` is the `UIMessage[]` JSON; `reasoning_override` is the per-conversation effort
 * (nullable, validated on read); `model_id` is the per-conversation model override (nullable,
 * validated on read - empty/non-string fails soft to inherit); `revision` is the
 * optimistic-concurrency token bumped on every
 * write; `pinned_at` is the unix-epoch seconds the conversation was pinned (nullable, set when
 * pinned and null when unpinned; it never bumps `revision`); `forked_from_id` is the parent
 * conversation id and `forked_from_message_id` the stable parent message id at the branch point.
 * Both lineage columns are nullable, soft fail-soft references with no foreign key or cascade:
 * deleting a parent leaves its children intact, and a dangling reference simply reads as
 * lineage-unavailable; they never bump `revision`. Timestamps are unix-epoch seconds.
 * The `owner` index serves the owner-scoped list query.
 */
export const conversationTable = sqliteTable(
  'conversation',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    title: text('title').notNull(),
    messages: text('messages', { mode: 'json' }).$type<UIMessage[]>().notNull(),
    reasoningOverride: text('reasoning_override'),
    modelId: text('model_id'),
    pinnedAt: integer('pinned_at'),
    forkedFromId: text('forked_from_id'),
    forkedFromMessageId: text('forked_from_message_id'),
    revision: integer('revision').notNull().default(0),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('conversation_owner_idx').on(t.owner)],
);

/**
 * Per-owner UI session state, kept separate from the schema-versioned settings JSON.
 * `last_active_conversation_id` drives root-entry restore (the conversation URL itself restores
 * on reload of a `/c/:id` path).
 */
export const appStateTable = sqliteTable('app_state', {
  owner: text('owner').primaryKey(),
  lastActiveConversationId: text('last_active_conversation_id'),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(unixepoch())`),
});
