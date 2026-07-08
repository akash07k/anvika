import { generateId, safeValidateUIMessages } from 'ai';
import { Hono } from 'hono';
import { ZodError } from 'zod';

import {
  ConversationDetailSchema,
  ConversationListResponseSchema,
} from '@anvika/shared/conversation/responses';
import { ConversationIdSchema } from '@anvika/shared/conversation/id';
import { makeApiError } from '@anvika/shared/errors';
import { MessageMetadataSchema } from '@anvika/shared/chat/message-metadata';

import { ensureMessageIds } from '../chat/ensure-message-ids';
import { serverLogger } from '../logging/logger';
import { OWNER_LOCAL } from '../persistence/owner';
import type {
  ActiveConversationStore,
  ConversationSummary,
  MultiConversationStore,
} from '../persistence/ports';

/** Dependencies for the read endpoints (list + detail). */
export interface ConversationsReadDeps {
  /** The id-keyed conversation store (list/load/heal). */
  conversationStore?: MultiConversationStore | undefined;
  /** The active-conversation pointer store (read-only here). */
  activeStore?: ActiveConversationStore | undefined;
  /** Unique-id generator for healing blank ids; defaults to the `ai` `generateId`. */
  newId?: (() => string) | undefined;
}

/**
 * Resolve the active id defensively: the stored pointer only if it still names a listed
 * conversation, else the most-recently-updated conversation (`conversations[0]`, since `list` is
 * `updatedAt` DESC), else `null`. GET is side-effect-free - a stale pointer self-heals on the next
 * write, never on read.
 *
 * @param stored - The stored active id, or null.
 * @param conversations - The owner's conversation summaries, most-recent first.
 * @returns The active id to serve.
 */
function resolveActiveId(
  stored: string | null,
  conversations: ConversationSummary[],
): string | null {
  if (stored !== null && conversations.some((c) => c.id === stored)) return stored;
  return conversations[0]?.id ?? null;
}

/**
 * Content-safe failure detail for an unparseable persisted transcript: the issue PATHS only (e.g.
 * `0.parts.1.text`), never a Zod message (which can embed received values, i.e. a fragment of the
 * stored message text). The AI SDK wraps the underlying `ZodError` as the error's `cause`; when that
 * is absent we return an empty array so nothing content-bearing is ever logged.
 *
 * @param error - The `safeValidateUIMessages` failure error.
 * @returns The dot-joined issue paths, or `[]` when no `ZodError` cause is available.
 */
function issuePaths(error: Error): string[] {
  const cause = error.cause;
  if (cause instanceof ZodError) return cause.issues.map((i) => i.path.join('.'));
  return [];
}

/**
 * Register the read endpoints onto `app`:
 *
 * - `GET /api/v1/conversations` - the conversation list plus the defensively-resolved active id
 *   validated out with `ConversationListResponseSchema`. No write on read.
 * - `GET /api/v1/conversations/:id` - one conversation's detail, validated out with
 *   `ConversationDetailSchema`. The persisted `messages` JSON is a trust boundary, so it is
 *   validated with `safeValidateUIMessages` and blank legacy ids are healed via `healMessages`
 *   (messages-only, no revision bump) before serving.
 *
 * @param app - The Hono app to register the routes on.
 * @param deps - The injected stores and id generator.
 * @returns The same `app`, for chaining.
 */
export function registerConversationsRead(app: Hono, deps: ConversationsReadDeps): Hono {
  return app
    .get('/api/v1/conversations', async (c) => {
      const store = deps.conversationStore;
      if (!store)
        return c.json(ConversationListResponseSchema.parse({ conversations: [], activeId: null }));
      const conversations = await store.list(OWNER_LOCAL);
      const stored = (await deps.activeStore?.getActiveId(OWNER_LOCAL)) ?? null;
      const activeId = resolveActiveId(stored, conversations);
      return c.json(ConversationListResponseSchema.parse({ conversations, activeId }));
    })
    .get('/api/v1/conversations/:id', async (c) => {
      const store = deps.conversationStore;
      if (!store) return c.json(makeApiError('not-found', 'Conversation not found'), 404);
      const id = ConversationIdSchema.safeParse(c.req.param('id'));
      if (!id.success)
        return c.json(
          makeApiError('validation-error', 'Invalid conversation id', id.error.issues),
          400,
        );
      const detail = await store.load(OWNER_LOCAL, id.data);
      if (!detail) return c.json(makeApiError('not-found', 'Conversation not found'), 404);

      const validated = await safeValidateUIMessages({
        messages: detail.messages,
        metadataSchema: MessageMetadataSchema,
      });
      if (!validated.success) {
        // Content-safe: log only the failing issue PATHS, never `error.message` (a Zod message can
        // embed received values, i.e. a fragment of the stored message text).
        serverLogger('conversation').warn('discarding unparseable persisted conversation', {
          issues: issuePaths(validated.error),
        });
        return c.json(
          ConversationDetailSchema.parse({
            messages: [],
            title: detail.title,
            reasoningOverride: detail.reasoningOverride,
            modelId: detail.modelId,
            revision: detail.revision,
          }),
        );
      }
      const newId = deps.newId ?? generateId;
      const healed = ensureMessageIds(validated.data, newId);
      if (healed !== validated.data) {
        // A legacy row held a blank id; heal messages ONCE (no revision/updatedAt bump). Contain a
        // write failure so the read always succeeds.
        try {
          await store.healMessages(OWNER_LOCAL, id.data, healed);
        } catch (error) {
          serverLogger('conversation').warn('failed to persist healed conversation ids', {
            message: String(error),
          });
        }
      }
      return c.json(
        ConversationDetailSchema.parse({
          messages: healed,
          title: detail.title,
          reasoningOverride: detail.reasoningOverride,
          modelId: detail.modelId,
          revision: detail.revision,
        }),
      );
    });
}
