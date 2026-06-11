import { createFileRoute, redirect } from '@tanstack/react-router';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { conversationListQuery } from '../lib/conversation/conversationQueries';
import { queryClient } from '../lib/queryClient';
import { resolveEntryTarget } from '../lib/conversation/resolveEntryTarget';

/**
 * Entry loader: resolve the target conversation id from the list (active pointer, else most-recent,
 * else a stable draft) and throw a `redirect` to its `/c/:id` URL. The loader is resilient: if the
 * list fetch rejects (server error, network down, Zod validation throw), it falls back to a draft
 * rather than propagating the rejection and leaving the app with no accessible surface (a defensive
 * redirect that self-heals).
 *
 * @throws A TanStack Router `redirect` to `/c/$conversationId` - always.
 */
export async function entryLoader(): Promise<never> {
  let list: ConversationListResponse | null;
  try {
    list = await queryClient.ensureQueryData(conversationListQuery);
  } catch {
    list = null; // entry never dead-ends; fall back to a draft below
  }
  throw redirect({
    to: '/c/$conversationId',
    params: { conversationId: resolveEntryTarget(list) },
  });
}

/** The app entry: redirect to the per-conversation URL (`/c/:id`). */
export const Route = createFileRoute('/')({
  loader: entryLoader,
});
