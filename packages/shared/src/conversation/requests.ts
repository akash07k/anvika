import { z } from 'zod';

import { ConversationIdSchema } from './id';
import { MAX_STORED_TITLE_LENGTH } from './title';

/**
 * Request body for `PATCH /api/v1/conversations/:id`: rename a conversation.
 * Strict (unknown keys rejected) per the both-direction trust-boundary rule.
 * `title` is trimmed before validation; an all-whitespace string is rejected.
 */
export const RenameConversationSchema = z.strictObject({
  title: z.string().trim().min(1).max(MAX_STORED_TITLE_LENGTH),
});

/** A validated rename-conversation request body. */
export type RenameConversation = z.infer<typeof RenameConversationSchema>;

/** Upper bound on a single batch-delete request's id count, to bound the work a request can ask for. */
export const MAX_BATCH_DELETE_IDS = 1000;

/**
 * Request body for `POST /api/v1/conversations/delete-batch` (batch delete): a list of conversation
 * ids to delete. An empty list is allowed as a no-op; each id must be a valid short id; the list is
 * capped at {@link MAX_BATCH_DELETE_IDS} so one request cannot ask for unbounded work.
 * Strict (unknown keys rejected) per the both-direction trust-boundary rule.
 */
export const BatchDeleteSchema = z.strictObject({
  ids: z.array(ConversationIdSchema).max(MAX_BATCH_DELETE_IDS),
});

/** A validated batch-delete request body. */
export type BatchDelete = z.infer<typeof BatchDeleteSchema>;

/**
 * Request body for `PUT /api/v1/conversations/active`: set the active conversation.
 * Strict (unknown keys rejected) per the both-direction trust-boundary rule.
 */
export const SetActiveSchema = z.strictObject({
  id: ConversationIdSchema,
});

/** A validated set-active-conversation request body. */
export type SetActive = z.infer<typeof SetActiveSchema>;

/**
 * Request body for `PUT /api/v1/conversations/:id/pin`: pin or unpin a conversation.
 * Strict (unknown keys rejected) per the both-direction trust-boundary rule.
 */
export const SetPinSchema = z.strictObject({
  pinned: z.boolean(),
});

/** A validated set-pin request body. */
export type SetPin = z.infer<typeof SetPinSchema>;

/**
 * Request body for `POST /api/v1/conversations/:id/branch`: branch a conversation into a new one.
 * Strict (unknown keys rejected) per the both-direction trust-boundary rule.
 *
 * `newId` is the caller-supplied id for the new branch. An OMITTED `throughIndex` means "copy the
 * whole source conversation"; a present `throughIndex` copies `messages[0..throughIndex]` (the
 * per-message branch). `baseRevision` is required so the branch is rejected when the source has
 * moved on under it (optimistic concurrency).
 */
export const BranchConversationSchema = z.strictObject({
  newId: ConversationIdSchema,
  throughIndex: z.number().int().nonnegative().optional(),
  baseRevision: z.number().int().nonnegative(),
});

/** A validated branch-conversation request body. */
export type BranchConversation = z.infer<typeof BranchConversationSchema>;
