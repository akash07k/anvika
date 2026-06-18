import { z } from 'zod';

import { ReasoningEffortSchema } from '../reasoning/effort';
import { ConversationIdSchema } from './id';
import { MAX_STORED_TITLE_LENGTH } from './title';

/**
 * One row in the conversation list. `title` may be empty for a draft that was created
 * by a setting change before its first message. `updatedAt` is unix-epoch seconds.
 * `pinnedAt` is the unix-epoch SECONDS the conversation was pinned, or null when unpinned;
 * pinned rows sort newest-pinned first. `revision` is the optimistic-concurrency token the
 * client reads as its `baseRevision` (always present).
 */
export const ConversationSummarySchema = z.object({
  id: ConversationIdSchema,
  title: z.string(),
  updatedAt: z.number().int().nonnegative(),
  pinnedAt: z.number().int().nonnegative().nullable(),
  revision: z.number().int().nonnegative(),
});

/** A validated conversation-list row. */
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

/**
 * Response body for `GET /api/v1/conversations`: the full conversation list plus the
 * currently active conversation id. `activeId` is null when there is no active conversation.
 */
export const ConversationListResponseSchema = z.object({
  conversations: z.array(ConversationSummarySchema),
  activeId: ConversationIdSchema.nullable(),
});

/** A validated conversation-list response body. */
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

/**
 * Response body for `GET /api/v1/conversations/:id`: a single conversation's detail.
 * `messages` is validated shallowly as an array, mirroring `ChatRequestSchema`;
 * the deep `UIMessage` shape is owned by the AI SDK and validated there.
 * `reasoningOverride` is a concrete effort or null - never `'inherit'`.
 * `modelId` is a concrete model id or null - null means inherit the default model.
 * `revision` is the current message-history revision (always present).
 */
export const ConversationDetailSchema = z.object({
  messages: z.array(z.unknown()),
  reasoningOverride: ReasoningEffortSchema.nullable(),
  modelId: z.string().nullable(),
  title: z.string(),
  revision: z.number().int().nonnegative(),
});

/** A validated conversation-detail response body. */
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

/**
 * Response body for `POST /api/v1/conversations/delete-batch` (batch delete): how many
 * conversations were deleted, and the resulting active id, which may have changed if the active
 * conversation was among those deleted.
 */
export const BatchDeleteResultSchema = z.object({
  deleted: z.number().int().nonnegative(),
  activeId: ConversationIdSchema.nullable(),
});

/** A validated batch-delete result body. */
export type BatchDeleteResult = z.infer<typeof BatchDeleteResultSchema>;

/**
 * Response body for `DELETE /api/v1/conversations/:id` (single delete): the resulting
 * active id after the deletion, which may have changed if the deleted conversation was active.
 */
export const DeleteResultSchema = z.object({
  activeId: ConversationIdSchema.nullable(),
});

/** A validated single-delete result body. */
export type DeleteResult = z.infer<typeof DeleteResultSchema>;

/**
 * Response body for `POST /api/v1/conversations/:id/retitle` (AI-regenerated title):
 * the new title. Always non-empty.
 */
export const RetitleResultSchema = z.object({
  // Server-generated; never untrimmed, so no `.trim()` transform is needed here.
  title: z.string().min(1).max(MAX_STORED_TITLE_LENGTH),
});

/** A validated retitle result body. */
export type RetitleResult = z.infer<typeof RetitleResultSchema>;
