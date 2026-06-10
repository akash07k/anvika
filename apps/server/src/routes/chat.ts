import { safeValidateUIMessages } from 'ai';
import { Hono } from 'hono';

import { ChatRequestSchema, REQUEST_ID_HEADER } from '@anvika/shared/chat';
import { MessageMetadataSchema } from '@anvika/shared/chat/message-metadata';
import { makeApiError } from '@anvika/shared/errors';

import { defaultChatContentSink, latestUserText } from '../chat/content-log';
import { createSettingsModelResolver, type ResolvedChatModel } from '../chat/resolve-model';
import { resolveReasoning } from '../chat/resolve-reasoning';
import { streamChat } from '../chat/stream-chat';
import { stripEmptyAssistantTurns } from '../chat/strip-empty-assistant-turns';
import { serverLogger } from '../logging/logger';
import { ChatProviderUnconfiguredError } from '../models/registry';
import type { SettingsStore } from '../persistence/ports';
import {
  readModelOverride,
  readReasoningOverride,
  resolveChatPersistenceTarget,
} from './chat-persistence-target';
import type { CreateChatRouteInput } from './chat-route-input';

export type { CreateChatRouteInput } from './chat-route-input';

/**
 * Build the `POST /api/v1/chat` route: validate the request envelope with the shared schema,
 * validate the messages deeply with `safeValidateUIMessages`, resolve the model per request, and
 * return the streaming UI message stream response. The resolver is injectable so tests supply a
 * `MockLanguageModelV3`. When `logContent` is on, the latest user text is emitted through
 * `contentSink` right after validation (before resolution, so it is logged even if resolution
 * fails); assistant text is logged downstream by `streamChat`.
 *
 * Persistence is routed per request via {@link resolveChatPersistenceTarget}: a request carrying a
 * `conversationId` persists through the id-keyed `multiConversationStore` (with a pre-flight 409 on a
 * stale `baseRevision`); without one the turn stays ephemeral. The route calls no AI-SDK method
 * itself - it delegates to `streamChat`.
 *
 * @param input - Optional resolver override, content-logging controls, the id-keyed conversation
 *   store, and the id-keyed reasoning-override port.
 * @returns A Hono route exposing `POST /api/v1/chat`.
 */
export function createChatRoute(input: CreateChatRouteInput = {}): Hono {
  // The default resolver needs a `settingsStore`; production wires one in via `app.ts` and
  // tests inject `resolveModel` instead, so the `as` holds by the either-or invariant documented on
  // `settingsStore`. With neither injected, resolution defers to a contained 502 on the first request.
  const resolveModel =
    input.resolveModel ??
    createSettingsModelResolver({ settingsStore: input.settingsStore as SettingsStore });
  const logContent = input.logContent ?? false;
  const contentSink = input.contentSink ?? defaultChatContentSink;
  const multiConversationStore = input.multiConversationStore;

  return new Hono().post('/api/v1/chat', async (c) => {
    const rawRequestId = c.req.header(REQUEST_ID_HEADER);
    // Bound the client-supplied correlation header at the trust boundary (ADR 0007): forward only a
    // short, opaque id into the logs; an absent or over-long value becomes undefined so a buggy or
    // malicious client cannot bloat the operator's local log lines. (Injection is already prevented
    // by the log formatter's JSON-escaping; this is a length bound.) Read up front so it also tags
    // pre-stream failure logs (e.g. model resolution), matching the client's clientError id.
    const requestId = rawRequestId && rawRequestId.length <= 64 ? rawRequestId : undefined;

    const body: unknown = await c.req.json().catch(() => null);

    const envelope = ChatRequestSchema.safeParse(body);
    if (!envelope.success) {
      return c.json(
        makeApiError('validation-error', 'Invalid chat request', envelope.error.issues),
        400,
      );
    }

    // Drop content-free assistant turns (an errored or aborted turn leaves an assistant message with
    // empty parts) BEFORE deep validation: the UIMessage schema requires at least one part, so leaving
    // them in would reject the whole history with a 400 and poison the conversation. Every surviving
    // message is still validated at the boundary below.
    const cleanedMessages = stripEmptyAssistantTurns(envelope.data.messages);
    // Surface the recovery so the operator knows the client sent invalid state (a content-free turn
    // from an errored/aborted send). Content-safe: logs only the dropped COUNT, never any message.
    const droppedTurns = envelope.data.messages.length - cleanedMessages.length;
    if (droppedTurns > 0) {
      serverLogger('chat').warning('dropped content-free assistant turns before validation', {
        count: droppedTurns,
        requestId,
      });
    }
    const validated = await safeValidateUIMessages({
      messages: cleanedMessages,
      metadataSchema: MessageMetadataSchema,
    });
    if (!validated.success) {
      return c.json(
        makeApiError('validation-error', 'Invalid messages', validated.error.message),
        400,
      );
    }

    if (logContent) {
      contentSink({ role: 'user', text: latestUserText(validated.data) });
    }

    // Read this request's persistence target. A `baseRevision` with no `conversationId` is ignored
    // by the schema's contract (an ephemeral turn has no persisted revision to compare against).
    const conversationId = envelope.data.conversationId;
    const baseRevision = envelope.data.baseRevision;

    // Resolve where this request persists, capturing its id/baseRevision in the callback, and
    // run the pre-flight optimistic-concurrency check. On a stale baseRevision, 409 BEFORE resolving
    // the model or starting any stream - return JSON, not an SSE error.
    const target = await resolveChatPersistenceTarget({
      conversationId,
      baseRevision,
      multiConversationStore,
      activeStore: input.activeStore,
    });
    if (target.conflict) {
      // Surface the pre-flight optimistic-concurrency rejection so it is as visible as the
      // post-stream conflict. Content-safe: only the id, the stale revision, and the correlation id.
      serverLogger('chat').warning('chat send rejected: stale baseRevision (pre-flight conflict)', {
        conversationId,
        baseRevision,
        requestId,
      });
      return c.json(makeApiError('conflict', 'Conversation changed elsewhere'), 409);
    }
    const onTurnFinish = target.onTurnFinish;

    // The per-conversation model override authoritatively selects the turn's model when the request
    // targets a conversation - the DB is the source of truth (mirroring the reasoning override read
    // below), so an override set in another tab, or a client whose optimistic value briefly reverted,
    // still selects the persisted model. It falls back to the request-body modelId for an
    // ephemeral/inheriting turn, then to the settings default inside resolveModel.
    const modelOverride = await readModelOverride({
      conversationId,
      idModelOverrideStore: input.idModelOverrideStore,
    });
    const modelId = modelOverride ?? envelope.data.modelId ?? '';

    let model: ResolvedChatModel;
    try {
      model = await resolveModel(modelId);
    } catch (err) {
      if (err instanceof ChatProviderUnconfiguredError) {
        return c.json(makeApiError('unconfigured', err.message), 503);
      }
      serverLogger('chat').error('model resolution failed', { message: String(err), requestId });
      return c.json(makeApiError('provider-error', 'Could not initialise the model'), 502);
    }

    // Resolve the reasoning decision for the turn (effort cascade gated by the model's capability).
    // The per-conversation override is read by id when the request targets a conversation; absent
    // the store or the id it is null and the cascade falls through to the connection/global effort.
    // Log only content-safe outcome fields below.
    const conversationOverride = await readReasoningOverride({
      conversationId,
      idReasoningOverrideStore: input.idReasoningOverrideStore,
    });
    const reasoning = resolveReasoning({
      modelId: model.resolvedModelId,
      settings: model.settings,
      conversationOverride,
    });
    serverLogger('chat').info('reasoning resolved', {
      enabled: reasoning.enabled,
      enableKind: reasoning.enabled ? reasoning.enable.kind : undefined,
      // Content-safe: the resolved effort is an enum (off/low/medium/high), never message text.
      effort: reasoning.enabled ? reasoning.effort : undefined,
      // Content-safe: a boolean indicating whether the per-conversation override affected the cascade.
      conversationOverridePresent: conversationOverride !== null,
      requestId,
    });

    return await streamChat({
      model: model.model,
      resolvedModelId: model.resolvedModelId,
      settings: model.settings,
      messages: validated.data,
      logContent,
      contentSink,
      onTurnFinish,
      requestId,
      reasoning,
      abortSignal: c.req.raw.signal,
    });
  });
}
