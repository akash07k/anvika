import { Hono } from 'hono';

import { SetPinSchema } from '@anvika/shared/conversation/requests';
import { makeApiError } from '@anvika/shared/errors';

import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type { MultiConversationStore } from '../persistence/ports';
import { parseConversationId } from './conversation-route-guards';

/** Dependencies for the pin endpoint. */
export interface ConversationsPinDeps {
  /** The id-keyed conversation store (a single transactional `setPinned` persists and guards). Optional. */
  conversationStore?: MultiConversationStore | undefined;
}

/**
 * Register the pin endpoint onto `app`: `PUT /api/v1/conversations/:id/pin` toggles a conversation's
 * pinned state (204). The body is validated in with {@link SetPinSchema} (strict, both-direction
 * rule); a malformed body is a 400 `validation-error`, an unknown id a 404. Existence is checked
 * transactionally inside `setPinned` (a single atomic UPDATE reporting whether a row was updated),
 * so there is no load-then-set race. The outcome log is
 * content-safe - only the id and the `pinned` boolean cross the log boundary, never the title.
 *
 * @param app - The Hono app to register the route on.
 * @param deps - The injected conversation store (absent disables the endpoint with a 404).
 * @returns The same `app`, for chaining.
 */
export function registerConversationsPin(app: Hono, deps: ConversationsPinDeps): Hono {
  const store = deps.conversationStore;
  return app.put('/api/v1/conversations/:id/pin', async (c) => {
    if (!store) return c.json(makeApiError('not-found', 'Conversation not found'), 404);
    const id = parseConversationId(c);
    if (id.response) return id.response;
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = SetPinSchema.safeParse(body);
    if (!parsed.success)
      return c.json(makeApiError('validation-error', 'Invalid pin body', parsed.error.issues), 400);
    const updated = await store.setPinned(OWNER_LOCAL, id.id, parsed.data.pinned);
    if (!updated) return c.json(makeApiError('not-found', 'Conversation not found'), 404);
    serverLogger('conversation').info('set conversation pin', {
      id: id.id,
      pinned: parsed.data.pinned,
    });
    return c.body(null, 204);
  });
}
