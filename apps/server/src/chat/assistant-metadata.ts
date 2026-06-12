import type { TextStreamPart, ToolSet } from 'ai';

import type { MessageMetadata } from '@anvika/shared/chat/message-metadata';
import type { Settings } from '@anvika/shared/settings/schema';

import { toUsageMetadata } from './usage-metadata';
import { priceForModelId } from '../models/price';

/** Context the {@link buildAssistantMetadata} builder needs to stamp a turn's metadata. */
export interface AssistantMetadataContext {
  /** The server-resolved namespaced `provider:model` id, or undefined in ephemeral/test paths. */
  resolvedModelId?: string | undefined;
  /** The validated settings the turn resolved from, used for the price snapshot; may be undefined. */
  settings?: Settings | undefined;
  /** The content-safe think duration (ms) for the turn, or undefined when no thinking occurred. */
  reasoningMs?: number | undefined;
}

/**
 * Build the per-part assistant {@link MessageMetadata} fragment for one stream part, or `undefined`
 * when the part carries no metadata. At `start`, stamp the stream-start instant as `createdAt`
 * (epoch ms). At `finish-step`, stamp the content-safe usage block (token counts, finish reason,
 * model id, price snapshot) when a `resolvedModelId` is known, plus the reasoning duration when the
 * turn thought. The SDK merges the fragments returned across parts, so the fields survive on the
 * final message - hence the per-part return is a {@link Partial} of the full metadata. Privacy:
 * reads only counts, ids, finish reason, rates, and a duration - never prompt or response text.
 *
 * @param part - The AI SDK stream part (same union the SDK passes to `messageMetadata`).
 * @param context - The resolved model id, settings, and reasoning duration for the turn.
 * @returns The metadata fragment to merge onto the assistant message, or `undefined` for parts that
 *   add none.
 */
export function buildAssistantMetadata(
  part: TextStreamPart<ToolSet>,
  context: AssistantMetadataContext,
): Partial<MessageMetadata> | undefined {
  if (part.type === 'start') return { createdAt: Date.now() };
  if (part.type === 'finish-step') {
    const usage =
      context.resolvedModelId !== undefined
        ? toUsageMetadata(
            part,
            context.resolvedModelId,
            context.settings !== undefined
              ? priceForModelId(context.resolvedModelId, context.settings)
              : null,
          )
        : undefined;
    if (usage === undefined && context.reasoningMs === undefined) return undefined;
    return {
      ...(usage !== undefined ? { usage } : {}),
      ...(context.reasoningMs !== undefined ? { reasoningMs: context.reasoningMs } : {}),
    };
  }
  return undefined;
}
