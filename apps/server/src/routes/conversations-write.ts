import { Hono } from 'hono';

import {
  BatchDeleteResultSchema,
  DeleteResultSchema,
  RetitleResultSchema,
} from '@anvika/shared/conversation/responses';
import {
  BatchDeleteSchema,
  RenameConversationSchema,
  SetActiveSchema,
} from '@anvika/shared/conversation/requests';
import { SetModelOverrideSchema, SetReasoningOverrideSchema } from '@anvika/shared/conversation';
import { makeApiError } from '@anvika/shared/errors';

import { serverLogger } from '../logging/logger';
import { ChatProviderUnconfiguredError } from '../models/registry';
import { OWNER_LOCAL } from '../persistence/owner';
import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
} from '../persistence/ports';
import { loadOr404, parseConversationId } from './conversation-route-guards';
import type { RetitleFn } from './conversations';

/** Dependencies for the write endpoints (rename, retitle, delete, batch-delete, set-active, reasoning, model override). */
export interface ConversationsWriteDeps {
  /** The id-keyed conversation store (load/rename/delete/deleteMany). */
  conversationStore?: MultiConversationStore | undefined;
  /** The id-keyed reasoning-override store (set only here). */
  reasoningOverrideStore?: IdReasoningOverrideStore | undefined;
  /** The id-keyed model-override store (set only here). */
  modelOverrideStore?: IdModelOverrideStore | undefined;
  /** The active-conversation pointer store (read + recompute-write). */
  activeStore?: ActiveConversationStore | undefined;
  /** On-demand AI retitle function; absent disables the retitle endpoint (404). */
  retitle?: RetitleFn | undefined;
}

/**
 * Recompute and persist the active pointer when the previously-active id was just removed: the
 * new active is the most-recently-updated REMAINING conversation, or `null` when none remain. When
 * the active id was NOT among the removed ids, the pointer is left untouched.
 *
 * @param store - The conversation store, to re-list the survivors.
 * @param activeStore - The active-pointer store, to read and write the pointer.
 * @param removed - The ids that were just deleted.
 * @returns The resulting active id (recomputed and written, or the unchanged stored value).
 */
async function recomputeActiveAfterDelete(
  store: MultiConversationStore,
  activeStore: ActiveConversationStore | undefined,
  removed: string[],
): Promise<string | null> {
  const current = (await activeStore?.getActiveId(OWNER_LOCAL)) ?? null;
  if (current === null || !removed.includes(current)) return current;
  const survivors = await store.list(OWNER_LOCAL);
  const next = survivors[0]?.id ?? null;
  await activeStore?.setActiveId(OWNER_LOCAL, next);
  return next;
}

/**
 * Register the write endpoints onto `app`: rename, AI retitle, delete, batch-delete, set-active,
 * the per-conversation reasoning override, and the per-conversation model override. Every body is
 * validated in with its request schema and every non-204 body is validated out with its response
 * schema (both-direction rule). Active recompute runs on delete/batch-delete when
 * the removed set contained the active id.
 *
 * @param app - The Hono app to register the routes on.
 * @param deps - The injected stores.
 * @returns The same `app`, for chaining.
 */
export function registerConversationsWrite(app: Hono, deps: ConversationsWriteDeps): Hono {
  const store = deps.conversationStore;
  const notFound = makeApiError('not-found', 'Conversation not found');
  // Register the static-segment routes (active, delete-batch) before `/:id` so Hono's
  // registration-order matching never routes them into the `:id` handlers.
  return app
    .put('/api/v1/conversations/active', async (c) => {
      if (!store) return c.json(notFound, 404);
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = SetActiveSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          makeApiError('validation-error', 'Invalid set-active body', parsed.error.issues),
          400,
        );
      if (!(await store.load(OWNER_LOCAL, parsed.data.id))) return c.json(notFound, 404);
      await deps.activeStore?.setActiveId(OWNER_LOCAL, parsed.data.id);
      serverLogger('conversation').info('set active conversation', { id: parsed.data.id });
      return c.body(null, 204);
    })
    .post('/api/v1/conversations/delete-batch', async (c) => {
      if (!store) return c.json(notFound, 404);
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = BatchDeleteSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          makeApiError('validation-error', 'Invalid batch-delete body', parsed.error.issues),
          400,
        );
      const before = new Set((await store.list(OWNER_LOCAL)).map((s) => s.id));
      // Dedupe so a duplicated id in the request is never counted twice (the array is not a set).
      const deleted = [...new Set(parsed.data.ids)].filter((id) => before.has(id)).length;
      await store.deleteMany(OWNER_LOCAL, parsed.data.ids);
      const activeId = await recomputeActiveAfterDelete(store, deps.activeStore, parsed.data.ids);
      serverLogger('conversation').info('batch deleted conversations', { deleted });
      return c.json(BatchDeleteResultSchema.parse({ deleted, activeId }));
    })
    .patch('/api/v1/conversations/:id/reasoning', async (c) => {
      if (!store) return c.json(notFound, 404);
      const id = parseConversationId(c);
      if (id.response) return id.response;
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = SetReasoningOverrideSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          makeApiError('validation-error', 'Invalid reasoning override', parsed.error.issues),
          400,
        );
      // Create-if-absent: a draft id (valid short id, no row yet) needs an empty-messages
      // revision-1 row so the very first turn honors the override, instead of a 404. saveTurn([]) is
      // idempotent - it creates the row when absent and is a no-op (no message clobber, no revision
      // bump) when present - so this is race-free without a separate check-then-act load.
      try {
        await store.saveTurn(OWNER_LOCAL, id.id, []);
        await deps.reasoningOverrideStore?.setReasoningOverride(
          OWNER_LOCAL,
          id.id,
          parsed.data.reasoningOverride,
        );
      } catch (err) {
        // A persistence failure would otherwise surface only as the generic app.onError 500; log a
        // content-safe, use-case-specific error (the effort enum / DB message, never message text)
        // and let it bubble to the canonical 500.
        serverLogger('conversation').error('reasoning override write failed', {
          message: String(err),
        });
        throw err;
      }
      serverLogger('conversation').info('set reasoning override', {
        effort: parsed.data.reasoningOverride ?? 'inherit',
      });
      return c.body(null, 204);
    })
    .patch('/api/v1/conversations/:id/model', async (c) => {
      if (!store) return c.json(notFound, 404);
      const id = parseConversationId(c);
      if (id.response) return id.response;
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = SetModelOverrideSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          makeApiError('validation-error', 'Invalid model override', parsed.error.issues),
          400,
        );
      // Create-if-absent: a draft id (valid short id, no row yet) needs an empty-messages
      // revision-1 row so the very first turn honors the override, instead of a 404. saveTurn([]) is
      // idempotent - it creates the row when absent and is a no-op (no message clobber, no revision
      // bump) when present - so this is race-free without a separate check-then-act load.
      try {
        await store.saveTurn(OWNER_LOCAL, id.id, []);
        await deps.modelOverrideStore?.setModelOverride(OWNER_LOCAL, id.id, parsed.data.modelId);
      } catch (err) {
        // A persistence failure would otherwise surface only as the generic app.onError 500; log a
        // content-safe, use-case-specific error (the model id / DB message, never message text) and
        // let it bubble to the canonical 500.
        serverLogger('conversation').error('model override write failed', {
          message: String(err),
        });
        throw err;
      }
      serverLogger('conversation').info('set model override', {
        model: parsed.data.modelId ?? 'inherit',
      });
      return c.body(null, 204);
    })
    .post('/api/v1/conversations/:id/retitle', async (c) => {
      // Optional-dep guard: with no store OR no retitle function injected, the endpoint is a 404
      // (matching the other handlers); the retitle function is wired only from the composition root.
      if (!store || !deps.retitle) return c.json(notFound, 404);
      const id = parseConversationId(c);
      if (id.response) return id.response;
      const loaded = await loadOr404(c, store, id.id);
      if (loaded.response) return loaded.response;
      let title: string;
      try {
        // Content-safe: the sample text and the returned title are never logged here.
        title = await deps.retitle(loaded.detail.messages);
      } catch (err) {
        // An unconfigured model surfaces exactly as the chat route's `unconfigured` 503; any other
        // provider failure maps to the chat route's `provider-error` 502 (contract parity).
        if (err instanceof ChatProviderUnconfiguredError)
          return c.json(makeApiError('unconfigured', err.message), 503);
        serverLogger('conversation').error('retitle model failed', { message: String(err) });
        return c.json(makeApiError('provider-error', 'Could not regenerate the title'), 502);
      }
      await store.rename(OWNER_LOCAL, id.id, title);
      serverLogger('conversation').info('retitled conversation via model');
      return c.json(RetitleResultSchema.parse({ title }));
    })
    .patch('/api/v1/conversations/:id', async (c) => {
      if (!store) return c.json(notFound, 404);
      const id = parseConversationId(c);
      if (id.response) return id.response;
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = RenameConversationSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          makeApiError('validation-error', 'Invalid rename body', parsed.error.issues),
          400,
        );
      const loaded = await loadOr404(c, store, id.id);
      if (loaded.response) return loaded.response;
      await store.rename(OWNER_LOCAL, id.id, parsed.data.title);
      serverLogger('conversation').info('renamed conversation', { id: id.id });
      return c.body(null, 204);
    })
    .delete('/api/v1/conversations/:id', async (c) => {
      if (!store) return c.json(notFound, 404);
      const id = parseConversationId(c);
      if (id.response) return id.response;
      const loaded = await loadOr404(c, store, id.id);
      if (loaded.response) return loaded.response;
      await store.delete(OWNER_LOCAL, id.id);
      const activeId = await recomputeActiveAfterDelete(store, deps.activeStore, [id.id]);
      serverLogger('conversation').info('deleted conversation', { id: id.id });
      return c.json(DeleteResultSchema.parse({ activeId }));
    });
}
