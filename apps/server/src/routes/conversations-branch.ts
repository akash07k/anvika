import type { Context } from 'hono';
import { Hono } from 'hono';

import { BranchConversationSchema } from '@anvika/shared/conversation/requests';
import { ConversationSummarySchema } from '@anvika/shared/conversation/responses';
import { makeApiError } from '@anvika/shared/errors';

import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type { BranchResult, MultiConversationStore } from '../persistence/ports';
import { parseConversationId } from './conversation-route-guards';

/** Dependencies for the branch endpoint. */
export interface ConversationsBranchDeps {
  /** The id-keyed conversation store whose `branch` copies a source into a new conversation. Optional. */
  conversationStore?: MultiConversationStore | undefined;
}

/**
 * Map a failed {@link BranchResult} to a ready-to-send API error response, content-safe logged at
 * `warning`. `not-found` (absent source) is 404; `conflict` (stale `baseRevision`) is 409 and carries
 * the source's `currentRevision` in `details` so the caller can re-base; `collision` (the `newId`
 * already exists) is also 409 with a distinct message; `bad-index` (a `throughIndex` past the source's
 * last message) is a 400 `validation-error` (no dedicated code exists, ADR 0007 - the index is invalid
 * input). Only the ids cross the log boundary, never titles or message text.
 *
 * @param c - The Hono request context (for `c.json`).
 * @param result - The failed branch outcome to translate.
 * @param sourceId - The source conversation id, for the content-safe warning log.
 * @returns The HTTP error response to return.
 */
function branchErrorResponse(
  c: Context,
  result: Extract<BranchResult, { ok: false }>,
  sourceId: string,
): Response {
  serverLogger('conversation').warning('branch rejected', { sourceId, reason: result.reason });
  switch (result.reason) {
    case 'not-found':
      return c.json(makeApiError('not-found', 'Conversation not found'), 404);
    case 'conflict':
      return c.json(
        makeApiError('conflict', 'Conversation changed since you loaded it', {
          currentRevision: result.currentRevision,
        }),
        409,
      );
    case 'collision':
      return c.json(makeApiError('conflict', 'Conversation id already exists'), 409);
    default:
      // `bad-index`: a `throughIndex` past the source's last message - invalid input, so 400. No
      // dedicated error code exists (ADR 0007), so the closest fit is `validation-error`.
      return c.json(makeApiError('validation-error', 'throughIndex is past the last message'), 400);
  }
}

/**
 * Register the branch endpoint onto `app`: `POST /api/v1/conversations/:id/branch` duplicates an
 * existing source conversation into a brand-new one (200 with the new {@link ConversationSummary}).
 * The two-segment path never collides with the `/:id` write handlers. The body is validated in with
 * {@link BranchConversationSchema} (strict, both-direction rule) and the success body is validated
 * out with {@link ConversationSummarySchema}; a malformed body is a 400 `validation-error`, an unknown
 * id a 404. The store's {@link BranchResult} reasons map to the API error contract via
 * {@link branchErrorResponse}. The outcome log is content-safe - only ids cross the boundary.
 *
 * @param app - The Hono app to register the route on.
 * @param deps - The injected conversation store (absent disables the endpoint with a 404).
 * @returns The same `app`, for chaining.
 */
export function registerConversationsBranch(app: Hono, deps: ConversationsBranchDeps): Hono {
  const store = deps.conversationStore;
  return app.post('/api/v1/conversations/:id/branch', async (c) => {
    if (!store) return c.json(makeApiError('not-found', 'Conversation not found'), 404);
    const id = parseConversationId(c);
    if (id.response) return id.response;
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = BranchConversationSchema.safeParse(body);
    if (!parsed.success)
      return c.json(
        makeApiError('validation-error', 'Invalid branch body', parsed.error.issues),
        400,
      );
    const result = await store.branch(
      OWNER_LOCAL,
      id.id,
      parsed.data.newId,
      parsed.data.throughIndex,
      parsed.data.baseRevision,
    );
    if (!result.ok) return branchErrorResponse(c, result, id.id);
    serverLogger('conversation').info('branched conversation', {
      sourceId: id.id,
      newId: parsed.data.newId,
    });
    return c.json(ConversationSummarySchema.parse(result.summary));
  });
}
