import type { QueryClient } from '@tanstack/react-query';

import {
  BatchDeleteResultSchema,
  ConversationSummarySchema,
  DeleteResultSchema,
  RetitleResultSchema,
  type BatchDeleteResult,
  type ConversationSummary,
  type DeleteResult,
  type RetitleResult,
} from '@anvika/shared/conversation/responses';

import { ApiClientError, apiDelete, apiPatchNoContent, apiPost, apiPut } from '../api-client';
import { invalidateConversation } from './conversationQueries';

/**
 * Assert that a schema-validated response carried a body. The api-client returns
 * `undefined` for a 204; these endpoints contract a 200 body, so an empty response is
 * malformed and surfaces as a `validation-error` {@link ApiClientError}.
 *
 * @param value - The possibly-undefined validated body.
 * @param what - A short label for the missing body, used in the error message.
 * @returns The body, narrowed to a defined value.
 * @throws ApiClientError With code `validation-error` when `value` is undefined.
 */
function requireBody<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new ApiClientError('validation-error', `Missing ${what} response body`, undefined);
  }
  return value;
}

/**
 * Rename a conversation. Sends `{ title }` to `PATCH /api/v1/conversations/:id`,
 * which the server validates and answers with 204 (no body).
 *
 * @param id - The conversation id to rename.
 * @param title - The new title (server trims and length-checks it).
 */
export async function renameConversation(id: string, title: string): Promise<void> {
  await apiPatchNoContent(`/api/v1/conversations/${id}`, { title });
}

/**
 * Delete a single conversation via `DELETE /api/v1/conversations/:id`, returning the
 * resulting active id (which may change if the deleted conversation was active).
 *
 * @param id - The conversation id to delete.
 * @returns The validated {@link DeleteResult}.
 */
export async function deleteConversation(id: string): Promise<DeleteResult> {
  const result = await apiDelete(`/api/v1/conversations/${id}`, DeleteResultSchema);
  return requireBody(result, 'delete-conversation');
}

/**
 * Delete several conversations at once via `POST /api/v1/conversations/delete-batch`,
 * returning how many were deleted and the resulting active id.
 *
 * @param ids - The conversation ids to delete.
 * @returns The validated {@link BatchDeleteResult}.
 */
export async function batchDeleteConversations(ids: string[]): Promise<BatchDeleteResult> {
  const result = await apiPost(
    '/api/v1/conversations/delete-batch',
    { ids },
    BatchDeleteResultSchema,
  );
  return requireBody(result, 'batch-delete');
}

/**
 * Branch a conversation into a new one via `POST /api/v1/conversations/:id/branch`, forking the
 * source's messages (the whole conversation, or up to `throughIndex` inclusive) into a fresh
 * conversation under `newId`, and returning that new conversation's summary.
 *
 * `baseRevision` is the optimistic-concurrency cursor: the server rejects with a `conflict` (409)
 * when the source has advanced past it elsewhere, leaving nothing created.
 *
 * @param sourceId - The conversation id to branch from.
 * @param newId - The client-minted id for the new (branched) conversation.
 * @param baseRevision - The source's last-seen revision (optimistic-concurrency cursor).
 * @param throughIndex - The inclusive message index to branch through; omit to branch the whole conversation.
 * @returns The validated {@link ConversationSummary} of the new conversation.
 */
export async function branchConversation(
  sourceId: string,
  newId: string,
  baseRevision: number,
  throughIndex?: number,
): Promise<ConversationSummary> {
  const result = await apiPost(
    `/api/v1/conversations/${sourceId}/branch`,
    { newId, baseRevision, ...(throughIndex !== undefined ? { throughIndex } : {}) },
    ConversationSummarySchema,
  );
  return requireBody(result, 'branch-conversation');
}

/**
 * Set the active conversation via `PUT /api/v1/conversations/active`, which answers
 * with 204 (no body).
 *
 * @param id - The conversation id to make active.
 */
export async function setActiveConversation(id: string): Promise<void> {
  await apiPut('/api/v1/conversations/active', { id });
}

/**
 * Pin or unpin a conversation via `PUT /api/v1/conversations/:id/pin`, which answers with
 * 204 (no body). Reuses {@link apiPut}, which tolerates the empty 204 response.
 *
 * @param id - The conversation id to pin or unpin.
 * @param pinned - `true` to pin, `false` to unpin.
 */
export async function setPinnedConversation(id: string, pinned: boolean): Promise<void> {
  await apiPut(`/api/v1/conversations/${id}/pin`, { pinned });
}

/**
 * Ask the server to AI-regenerate a conversation's title via
 * `POST /api/v1/conversations/:id/retitle` (no request body), returning the new title.
 *
 * @param id - The conversation id to retitle.
 * @returns The validated {@link RetitleResult}.
 */
export async function retitleConversation(id: string): Promise<RetitleResult> {
  const result = await apiPost(
    `/api/v1/conversations/${id}/retitle`,
    undefined,
    RetitleResultSchema,
  );
  return requireBody(result, 'retitle');
}

/** The outcome of handling a possible conflict error: whether it was an optimistic-concurrency conflict. */
export interface ConflictOutcome {
  /** `true` when the error was a `conflict` {@link ApiClientError}; the caller should prompt the user to resend. */
  isConflict: boolean;
}

/**
 * Handle an error that may be an optimistic-concurrency `conflict` from a chat send. When it is a
 * `conflict` {@link ApiClientError}, the conversation changed elsewhere, so the stale detail and
 * list caches are invalidated and `isConflict` is returned `true` for the UI to announce a resend.
 * Any other error is left untouched (`isConflict` is `false`) so the caller can handle it normally.
 *
 * @param id - The conversation id whose send conflicted.
 * @param error - The error thrown by the chat send.
 * @param queryClient - The TanStack {@link QueryClient} whose caches to invalidate.
 * @returns A {@link ConflictOutcome} flagging whether this was a conflict.
 */
export function onConversationConflict(
  id: string,
  error: unknown,
  queryClient: QueryClient,
): ConflictOutcome {
  if (!(error instanceof ApiClientError) || error.code !== 'conflict') {
    return { isConflict: false };
  }
  invalidateConversation(queryClient, id);
  return { isConflict: true };
}
