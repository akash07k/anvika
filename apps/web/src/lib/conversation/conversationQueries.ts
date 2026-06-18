import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';

import {
  ConversationDetailSchema,
  ConversationListResponseSchema,
  type ConversationDetail,
  type ConversationListResponse,
  type ConversationSummary,
} from '@anvika/shared/conversation/responses';

import { ApiClientError, apiGet } from '../api-client';

/** TanStack Query key for the conversation list. */
export const conversationsListKey = ['conversations'] as const;

/**
 * TanStack Query key for a single conversation's detail, scoped by id.
 *
 * @param id - The conversation id, or `undefined` for a disabled/ephemeral query.
 * @returns The id-scoped detail query key.
 */
export function conversationDetailKey(id: string | undefined) {
  return ['conversation', id] as const;
}

/**
 * Invalidate the cached conversation list and, when an `id` is given, that conversation's detail.
 * The single source of truth for the list-plus-detail refresh pair shared by turn-finish, conflict
 * handling, and the reasoning-override write. Both queries use `staleTime: Infinity`, so this
 * explicit invalidation (not stale-driven refetch) is what refreshes the active observers.
 *
 * @param queryClient - The TanStack {@link QueryClient} whose caches to invalidate.
 * @param id - The conversation id whose detail to also invalidate, or `undefined` to refresh only the list.
 */
export function invalidateConversation(queryClient: QueryClient, id: string | undefined): void {
  void queryClient.invalidateQueries({ queryKey: conversationsListKey });
  if (id) void queryClient.invalidateQueries({ queryKey: conversationDetailKey(id) });
}

/**
 * Patch a SINGLE conversation row in the cached list, leaving every other row untouched. Used for
 * both an optimistic update and its per-row rollback, so a failed mutation reverts only the field it
 * changed and never clobbers a concurrent change a sibling row received in the meantime (which a
 * whole-snapshot restore would). A no-op when the list is not cached.
 *
 * @param queryClient - The TanStack {@link QueryClient} holding the list cache.
 * @param id - The conversation id whose row to patch.
 * @param patch - The partial summary fields to overwrite on the matching row. The `id` is excluded so
 *   a patch can never rewrite a row's identity (which would desync the cached row from its query key).
 */
export function patchConversationRow(
  queryClient: QueryClient,
  id: string,
  patch: Partial<Omit<ConversationSummary, 'id'>>,
): void {
  const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
  if (!list) return;
  queryClient.setQueryData<ConversationListResponse>(conversationsListKey, {
    ...list,
    conversations: list.conversations.map((summary) =>
      summary.id === id ? { ...summary, ...patch } : summary,
    ),
  });
}

/**
 * Query options for the conversation list. The shared schema validates the
 * response in both directions via {@link apiGet}; `data` is the validated
 * `{ conversations, activeId }`.
 *
 * `staleTime: Infinity`: the list is refreshed by EXPLICIT invalidation (the
 * override-write path in `useConversationReasoning`, turn-finish, conflict handling), never by
 * stale-driven refetch, so a newly-mounting observer must not trigger a background refetch.
 */
export const conversationListQuery = queryOptions({
  queryKey: conversationsListKey,
  staleTime: Infinity,
  queryFn: (): Promise<ConversationListResponse> =>
    apiGet('/api/v1/conversations', ConversationListResponseSchema),
});

/**
 * Subscribe to the conversation list and the currently active conversation id.
 *
 * @returns The TanStack Query result whose `data` is the validated
 *   {@link ConversationListResponse}.
 */
export function useConversationList() {
  return useQuery(conversationListQuery);
}

/**
 * The revision the client last saw for a conversation, read from the list query. Used as the chat
 * send's optimistic-concurrency cursor (`baseRevision`). `undefined` for a draft not yet in the list
 * (the server then skips the conflict check and creates the row); a number - possibly `0`, a
 * legitimate backfilled revision - for an existing conversation.
 *
 * @param id - The conversation id, or `undefined` for an ephemeral turn.
 * @returns The conversation's revision, or `undefined` when unknown.
 */
export function useBaseRevision(id: string | undefined): number | undefined {
  const list = useConversationList();
  if (!id) return undefined;
  return list.data?.conversations.find((c) => c.id === id)?.revision;
}

/**
 * Subscribe to a single conversation's detail by id. The shared schema validates a present row;
 * `data` then carries `messages`, `reasoningOverride`, `title`, and the optimistic-concurrency
 * `revision`.
 *
 * When `id` is `undefined` or an empty string the query is disabled and the queryFn
 * is never invoked - `data` remains `undefined` and no network request is fired.
 *
 * A `not-found` (404) resolves to `null` (a SUCCESS state), not an error: the id names a DRAFT with
 * no persisted row yet, an EXPECTED state, so the route renders an empty draft surface. Modeling it
 * as success (rather than an always-stale error) is what stops a second observer's mount from
 * triggering a refetch storm. There is no body to validate on a 404, so the short-circuit to `null`
 * happens before schema validation; a present row is still validated in both directions.
 *
 * `staleTime: Infinity`: the detail is refreshed by EXPLICIT invalidation (the override-write path
 * in `useConversationReasoning`, turn-finish, conflict handling), never by stale-driven refetch.
 * Invalidation still refetches active observers regardless of `staleTime`, so the refresh design is
 * preserved while a fresh query stops the mount-triggered refetch loop.
 *
 * A `validation-error` (malformed body) still throws and is not retried; transient failures
 * (network, 5xx) keep the standard three retries.
 *
 * @param id - The conversation id to load, or `undefined` to disable the query.
 * @returns The TanStack Query result whose `data` is the validated
 *   {@link ConversationDetail}, or `null` for a not-found draft.
 */
export function useConversationDetail(id: string | undefined) {
  return useQuery(
    queryOptions({
      queryKey: conversationDetailKey(id),
      enabled: Boolean(id),
      staleTime: Infinity,
      queryFn: async (): Promise<ConversationDetail | null> => {
        try {
          return await apiGet(`/api/v1/conversations/${id}`, ConversationDetailSchema);
        } catch (err) {
          // A draft has no persisted row yet: 404 is an expected empty state, not an error.
          if (err instanceof ApiClientError && err.code === 'not-found') return null;
          throw err;
        }
      },
      retry: (failureCount, error) => {
        // not-found is caught in the queryFn and never reaches retry; a validation-error still
        // throws and must not be retried (it is deterministic). Transient failures retry thrice.
        if (error instanceof ApiClientError && error.code === 'validation-error') return false;
        return failureCount < 3;
      },
    }),
  );
}
