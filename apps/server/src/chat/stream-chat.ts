import {
  consumeStream,
  createIdGenerator,
  streamText,
  type LanguageModel,
  type UIMessage,
} from 'ai';

import type { Settings } from '@anvika/shared/settings/schema';

import { buildAssistantMetadata } from './assistant-metadata';
import { defaultChatContentSink, type ChatContentSink } from './content-log';
import { mapTurnOutcome, type ChatTurnOutcome } from './conversation-outcome';
import { errorCauseDetail } from './error-cause';
import { safeChatErrorMessage } from './error-message';
import {
  createReasoningTimer,
  localThinkingParamsActive,
  reasoningModelFor,
  reasoningProviderOptionsFor,
} from './reasoning-apply';
import {
  pruneReasoningForReplay,
  stripIncompleteTurns,
  stripItemReferences,
} from './replay-sanitization';
import type { ReasoningDecision } from './resolve-reasoning';
import { withSseKeepAlive } from './sse-keep-alive';
import { serverLogger } from '../logging/logger';

/** Input for {@link streamChat}. */
export interface StreamChatInput {
  /** The resolved language model (a real provider, or a mock in tests). */
  model: LanguageModel;
  /** The validated conversation messages from the request. */
  messages: UIMessage[];
  /** Whether to log the assistant message text (default false). */
  logContent?: boolean | undefined;
  /** Where to emit content; defaults to the LogTape chat logger. Injectable for tests. */
  contentSink?: ChatContentSink | undefined;
  /**
   * Optional callback invoked once the turn finishes, with the mapped {@link ChatTurnOutcome}.
   * The chat route supplies it to persist the conversation; omitted, the turn is ephemeral.
   */
  onTurnFinish?: ((outcome: ChatTurnOutcome) => void | Promise<void>) | undefined;
  /** The client request's abort signal, forwarded into the model call so a disconnect or Stop aborts it. */
  abortSignal?: AbortSignal | undefined;
  /** The client-generated per-turn correlation id, stamped on every chat log line for the turn. */
  requestId?: string | undefined;
  /** The server-resolved namespaced `provider:model` id for the turn, recorded on the assistant
   *  message metadata and used to snapshot the price. Omitted in ephemeral/test paths. */
  resolvedModelId?: string | undefined;
  /** The validated settings the turn resolved from, used to map the `resolvedModelId` connection
   *  prefix to its type for the price snapshot. Omitted alongside `resolvedModelId` in
   *  ephemeral/test paths; when absent, the price snapshot is null. */
  settings?: Settings | undefined;
  /**
   * The resolved reasoning decision for the turn. When enabled it becomes `streamText` request
   * options and/or a model wrap (see `reasoning-apply`), streamed via `sendReasoning`; omitted is off.
   */
  reasoning?: ReasoningDecision | undefined;
}

/**
 * Orchestrate one streaming chat turn and return a UI message stream HTTP response. This is the
 * single module that touches the AI SDK streaming API (ADR 0009): it runs in persistence mode
 * (`originalMessages` + `onFinish`), maps the SDK finish signals into a domain
 * {@link ChatTurnOutcome}, and hands that to the injected `onTurnFinish`. Streaming errors are
 * routed into the stream by the AI SDK; `onError` logs the operational error (never prompt or
 * response text, per the privacy rule) and flags the turn so the outcome maps to `error`.
 *
 * The `onTurnFinish` callback fires after the response has already streamed to the client, so a
 * persistence-callback failure is caught and logged (operational error only) rather than thrown:
 * a write failure cannot crash the post-response path or leak content - the turn is simply not
 * persisted.
 *
 * The `stream complete` log line always carries `elapsedMs` (wall-clock latency). When
 * `logContent` is enabled, the full assistant message text is additionally emitted through
 * `contentSink` (default: the LogTape chat logger) - the opt-in content-logging mode.
 *
 * @param input - The model, the validated conversation messages, optional content-logging
 *   controls (`logContent`, `contentSink`), the optional `onTurnFinish` persistence callback, the
 *   optional client `abortSignal` (forwarded into the model call), and the optional per-turn
 *   `requestId` (stamped on every chat log line for the turn).
 * @returns A promise resolving to a streaming Web {@link Response} carrying the AI SDK UI
 *   message stream.
 */
export async function streamChat(input: StreamChatInput): Promise<Response> {
  const logContent = input.logContent ?? false;
  const contentSink = input.contentSink ?? defaultChatContentSink;
  const start = Date.now();
  let streamErrored = false;
  const reasoning: ReasoningDecision = input.reasoning ?? { enabled: false };
  const reasoningProviderOptions = reasoningProviderOptionsFor(reasoning);
  const model = reasoningModelFor(input.model, reasoning);
  const reasoningTimer = createReasoningTimer();
  const replay = await pruneReasoningForReplay(
    stripIncompleteTurns(stripItemReferences(input.messages)),
  );
  if (replay.prunedReasoning > 0) {
    serverLogger('chat').debug('pruned reasoning parts for replay', {
      count: replay.prunedReasoning,
      requestId: input.requestId,
    });
  }
  const result = streamText({
    model,
    messages: replay.messages,
    // Forward the abort signal only when present (exactOptionalPropertyTypes: spread conditionally).
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    ...(reasoningProviderOptions ? { providerOptions: reasoningProviderOptions } : {}),
    onChunk: ({ chunk }) => {
      // Content-safe: record only the chunk TYPE's timing (first reasoning/text instants), never text.
      reasoningTimer.record(chunk.type);
    },
    onError: ({ error }) => {
      streamErrored = true;
      // `cause` unwraps a wrapped error (e.g. the SDK RetryError) to the real provider failure that
      // `String(error)` hides; content-safe operational summary only (see errorCauseDetail).
      serverLogger('chat').error('stream error', {
        message: String(error),
        cause: errorCauseDetail(error),
        requestId: input.requestId,
      });
    },
    onFinish: (event) => {
      // Metadata always (finish reason, token counts, latency); the response text is logged
      // separately below, and only when content logging is enabled.
      serverLogger('chat').info('stream complete', {
        finishReason: event.finishReason,
        inputTokens: event.totalUsage.inputTokens,
        outputTokens: event.totalUsage.outputTokens,
        totalTokens: event.totalUsage.totalTokens,
        elapsedMs: Date.now() - start,
        requestId: input.requestId,
      });
      if (logContent) contentSink({ role: 'assistant', text: event.text });
    },
  });
  const response = result.toUIMessageStreamResponse({
    originalMessages: input.messages,
    // Forward reasoning parts to the client only when the decision enabled reasoning; a disabled
    // turn must not stream any reasoning the provider happens to emit. Content gating, not text.
    sendReasoning: reasoning.enabled,
    // Assign a stable server-side id to the assistant message so the persisted turn (and the live
    // client) never carry an empty id. A local openai-compatible provider supplies no response id,
    // and without this the SDK leaves the assistant id empty (verified in ai@6.0.197). Content-free.
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    // Stamp per-part metadata via the content-safe builder: `createdAt` at `start`, usage + the
    // reasoning duration (the content-safe first-reasoning-to-first-text gap) at `finish-step`.
    messageMetadata: ({ part }) => {
      const reasoningMs = reasoningTimer.elapsedMs();
      return buildAssistantMetadata(part, {
        ...(input.resolvedModelId !== undefined ? { resolvedModelId: input.resolvedModelId } : {}),
        ...(input.settings !== undefined ? { settings: input.settings } : {}),
        ...(reasoningMs !== undefined ? { reasoningMs } : {}),
      });
    },
    // Consume the SSE stream server-side so `onFinish` (and thus the abort log) runs even when the
    // client disconnects or aborts - without this an aborted turn produces zero server log.
    consumeSseStream: consumeStream,
    // Map a stream error to a content-safe category message for the client; the raw cause never
    // leaves the server (it stays in the `stream error` line above, with the requestId).
    onError: (error) => safeChatErrorMessage(error, localThinkingParamsActive(reasoning)),
    onFinish: async ({ messages, isAborted }) => {
      if (isAborted) {
        // An abort is a benign, expected outcome (Stop, or a superseding send); log it once at info
        // with elapsed time so a suspiciously long one is noticeable without crying wolf.
        serverLogger('chat').info('turn aborted', {
          elapsedMs: Date.now() - start,
          requestId: input.requestId,
        });
      }
      const outcome = mapTurnOutcome({
        isAborted,
        streamErrored,
        finalMessages: messages,
        incomingMessages: input.messages,
        ...(input.resolvedModelId !== undefined ? { resolvedModelId: input.resolvedModelId } : {}),
      });
      // This callback runs AFTER the response has streamed to the client, so a rejection here
      // cannot reach the client - left unguarded it becomes an uncontained rejection in the SDK's
      // stream-finalization path. Contain a persistence failure (locked DB, disk full, constraint
      // error): log the operational error only (never message/prompt text) and degrade gracefully -
      // the turn simply is not persisted.
      try {
        await input.onTurnFinish?.(outcome);
      } catch (error) {
        serverLogger('chat').error('failed to persist conversation turn', {
          message: String(error),
          requestId: input.requestId,
        });
      }
    },
  });
  // Keep the connection alive while the model is silent so a long quiet think is not reclaimed by
  // the server idle timeout: emit an SSE keep-alive comment during idle gaps (ignored by parsers).
  return withSseKeepAlive(response);
}
