import { z } from 'zod';

import { ConversationIdSchema } from './conversation/id';

/**
 * Chat request envelope for `POST /api/v1/chat`. Validates that `messages` is a non-empty array (a
 * turn needs at least one message) and that the optional `modelId` - the namespaced `provider:model`
 * id (the settings `selectedModelId`) - is a string when present. `modelId` is optional so a thin
 * client (and existing ephemeral tests) can omit it; when omitted the server falls back to the
 * settings `selectedModelId` and returns the `unconfigured` error only when
 * neither the request nor the settings default names a model. The optional `conversationId` (a
 * short `xxx-xxx` id) names the target persisted conversation; when absent the turn is ephemeral. The optional
 * `baseRevision` is the optimistic-concurrency token the client last read (from the conversation
 * summary); the server 409s a stale value before streaming begins. A `baseRevision` with no
 * `conversationId` is ignored, since an ephemeral turn has no persisted revision to compare against.
 * The AI SDK transport posts a richer envelope (`id`, `trigger`, ...);
 * this is a default (stripping) object - NOT strict - so extra fields are allowed and unknown keys
 * are stripped. The deep UIMessage shape is validated in the route with the AI SDK's own
 * `safeValidateUIMessages`.
 */
export const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
  modelId: z.string().optional(),
  conversationId: ConversationIdSchema.optional(),
  baseRevision: z.number().int().nonnegative().optional(),
});

/** A validated chat request envelope. */
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * The HTTP header carrying the client-generated per-turn correlation id. The client mints an opaque,
 * content-free id per chat turn and sends it under this header; the server stamps it on every chat
 * log line for that turn, so a client-side error ties to its server-side cause. Lowercase because
 * header names are case-insensitive and both ends compare the literal.
 */
export const REQUEST_ID_HEADER = 'x-anvika-request-id';
