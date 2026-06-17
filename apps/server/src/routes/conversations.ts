import type { UIMessage } from 'ai';
import { Hono } from 'hono';

import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
} from '../persistence/ports';
import { registerConversationsBranch } from './conversations-branch';
import { registerConversationsPin } from './conversations-pin';
import { registerConversationsRead } from './conversations-read';
import { registerConversationsWrite } from './conversations-write';

/**
 * Regenerate a title from a conversation's messages via a model call. Optional and injected from the
 * composition root (it needs the settings-driven model resolver); absent in tests/callers that omit
 * it, in which case the retitle endpoint answers 404 (the optional-dep guard).
 */
export type RetitleFn = (messages: readonly UIMessage[]) => Promise<string>;

/** Options for {@link createConversationsRoute}. */
export interface CreateConversationsRouteInput {
  /**
   * The id-keyed conversation store (list/load/rename/delete/deleteMany/healMessages). Optional so
   * callers and tests that omit it still typecheck; when absent, reads fail soft to empty and writes
   * answer 404.
   */
  conversationStore?: MultiConversationStore | undefined;
  /** The id-keyed reasoning-override store (set the per-conversation override). Optional. */
  reasoningOverrideStore?: IdReasoningOverrideStore | undefined;
  /** The id-keyed model-override store (set the per-conversation model override). Optional. */
  modelOverrideStore?: IdModelOverrideStore | undefined;
  /** The active-conversation pointer store (read on list, recompute-write on delete). Optional. */
  activeStore?: ActiveConversationStore | undefined;
  /**
   * Unique-id generator for healing legacy blank ids on read; defaults to the `ai` `generateId`.
   * Override in tests for deterministic ids.
   */
  newId?: (() => string) | undefined;
  /**
   * On-demand AI retitle function (see {@link RetitleFn}). Optional and additive: when absent the
   * `POST /:id/retitle` endpoint answers 404 (matching the other handlers' optional-dep guard).
   */
  retitle?: RetitleFn | undefined;
}

/**
 * Build the id-keyed conversations routes (all under `/api/v1/conversations`), composed from the
 * cohesive read and write modules so each authored file stays small:
 *
 * - `GET /api/v1/conversations` - list + defensive active id.
 * - `GET /api/v1/conversations/:id` - one conversation's detail (heal-on-read via `healMessages`).
 * - `PATCH /api/v1/conversations/:id` - rename (204).
 * - `POST /api/v1/conversations/:id/retitle` - AI-regenerate the title (200 with `{ title }`).
 * - `DELETE /api/v1/conversations/:id` - delete + active recompute.
 * - `POST /api/v1/conversations/delete-batch` - idempotent batch delete + active recompute.
 * - `PUT /api/v1/conversations/active` - set the active conversation (204).
 * - `PATCH /api/v1/conversations/:id/reasoning` - set the per-conversation reasoning override (204).
 * - `PATCH /api/v1/conversations/:id/model` - set the per-conversation model override (204).
 * - `PUT /api/v1/conversations/:id/pin` - pin or unpin the conversation (204).
 * - `POST /api/v1/conversations/:id/branch` - branch/duplicate into a new conversation (200 with the new summary).
 *
 * Every request and non-204 response body is validated at the boundary in both directions.
 *
 * @param input - The injected stores and optional id generator.
 * @returns A Hono instance exposing the conversations routes above.
 */
export function createConversationsRoute(input: CreateConversationsRouteInput): Hono {
  const app = new Hono();
  registerConversationsRead(app, {
    conversationStore: input.conversationStore,
    activeStore: input.activeStore,
    newId: input.newId,
  });
  registerConversationsPin(app, { conversationStore: input.conversationStore });
  registerConversationsBranch(app, { conversationStore: input.conversationStore });
  registerConversationsWrite(app, {
    conversationStore: input.conversationStore,
    reasoningOverrideStore: input.reasoningOverrideStore,
    modelOverrideStore: input.modelOverrideStore,
    activeStore: input.activeStore,
    retitle: input.retitle,
  });
  return app;
}
