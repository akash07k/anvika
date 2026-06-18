import type { Context } from 'hono';

import { ConversationIdSchema } from '@anvika/shared/conversation/id';
import { makeApiError } from '@anvika/shared/errors';

import { OWNER_LOCAL } from '../persistence/owner';
import type { ConversationDetail, MultiConversationStore } from '../persistence/ports';

/**
 * Parse and validate the `:id` route param as a conversation id. On a malformed id it returns the
 * ready-to-send 400 `validation-error` response; otherwise it returns the validated id string. The
 * write handlers share this so the `id.safeParse -> 400` preamble lives in one place.
 *
 * @param c - The Hono request context (for `c.req.param('id')` and `c.json`).
 * @returns `{ id }` with the validated id, or `{ response }` with the 400 to return.
 */
export function parseConversationId(
  c: Context,
): { id: string; response?: undefined } | { id?: undefined; response: Response } {
  const parsed = ConversationIdSchema.safeParse(c.req.param('id'));
  if (!parsed.success)
    return {
      response: c.json(
        makeApiError('validation-error', 'Invalid conversation id', parsed.error.issues),
        400,
      ),
    };
  return { id: parsed.data };
}

/**
 * Load a local-owner conversation by id, returning the detail or the ready-to-send 404
 * `not-found` response. The write handlers share this so the `store.load -> 404` preamble lives in
 * one place.
 *
 * @param c - The Hono request context (for `c.json`).
 * @param store - The conversation store to load from.
 * @param id - The validated conversation id.
 * @returns `{ detail }` with the loaded conversation, or `{ response }` with the 404 to return.
 */
export async function loadOr404(
  c: Context,
  store: MultiConversationStore,
  id: string,
): Promise<{ detail: ConversationDetail; response?: undefined } | { response: Response }> {
  const detail = await store.load(OWNER_LOCAL, id);
  if (!detail)
    return { response: c.json(makeApiError('not-found', 'Conversation not found'), 404) };
  return { detail };
}
