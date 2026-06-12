import type { UsageMetadata } from '@anvika/shared/chat/message-metadata';

import type { ModelPrice } from '../models/price';

/**
 * The content-safe subset of the AI SDK `finish-step` stream part that we map. Declared
 * structurally so the mapping is testable without importing SDK internals; the real part is a
 * superset.
 */
export interface FinishStepLike {
  /** Token counts reported by the provider for this turn. */
  usage: {
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
    inputTokenDetails?:
      | { cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined }
      | undefined;
    outputTokenDetails?: { reasoningTokens?: number | undefined } | undefined;
  };
  /** The finish reason the model reported. */
  finishReason: UsageMetadata['finishReason'];
  /** The raw finish reason string from the provider (may differ from the normalized enum). */
  rawFinishReason?: string | undefined;
  /** Provider response metadata for this turn. */
  response: { id: string; modelId: string; timestamp: Date };
}

/** Drop keys whose value is `undefined` so persisted JSON carries only reported fields. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}

/**
 * Map an AI SDK `finish-step` part, the server-resolved `provider:model` id, and the price
 * snapshot (or `null` when unpriced) to the content-safe {@link UsageMetadata} persisted on the
 * assistant turn. Pure and content-free: reads only counts, ids, the finish reason, and rates -
 * never text.
 *
 * @param step - The finish-step part (usage, finish reason, response metadata).
 * @param resolvedModelId - The server-resolved namespaced `provider:model` id for the turn.
 * @param price - The per-million-token price snapshot, or `null` when the model is unpriced.
 * @returns The usage metadata block to stamp on the assistant message.
 */
export function toUsageMetadata(
  step: FinishStepLike,
  resolvedModelId: string,
  price: ModelPrice | null,
): UsageMetadata {
  const tokens = compact({
    input: step.usage.inputTokens,
    output: step.usage.outputTokens,
    total: step.usage.totalTokens,
    cacheRead: step.usage.inputTokenDetails?.cacheReadTokens,
    cacheWrite: step.usage.inputTokenDetails?.cacheWriteTokens,
    reasoning: step.usage.outputTokenDetails?.reasoningTokens,
  });
  return compact({
    tokens: Object.keys(tokens).length > 0 ? tokens : undefined,
    finishReason: step.finishReason,
    rawFinishReason: step.rawFinishReason,
    modelId: resolvedModelId,
    providerReportedModelId: step.response.modelId,
    responseId: step.response.id,
    responseAt: step.response.timestamp.getTime(),
    price: price ?? undefined,
  }) as UsageMetadata;
}
