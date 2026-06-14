import type { UIMessage } from 'ai';

import type { MessageMetadata, UsageMetadata } from '@anvika/shared/chat/message-metadata';

/** The synthesized incomplete-turn reason (the user pressed Stop, or the stream failed). */
type IncompleteReason = NonNullable<UsageMetadata['incompleteReason']>;

/** Whether `tokens` carries at least one reported count. */
function hasTokenCount(tokens: UsageMetadata['tokens']): boolean {
  return (
    tokens !== undefined &&
    (tokens.input !== undefined || tokens.output !== undefined || tokens.total !== undefined)
  );
}

/**
 * Whether the LAST message is an assistant turn worth persisting after an error or abort: it has
 * non-empty streamed text OR the provider reported token usage. This is the locked empty-turn rule -
 * a turn that failed before producing anything is not persisted (the live error region already
 * announced it). Content-free: reads only part types/text-presence and token counts.
 *
 * @param messages - The assembled turn messages (user turn plus the partial assistant turn).
 * @returns True when the trailing assistant turn has text or usage; false otherwise.
 */
export function assistantTurnHasContent(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return false;
  const hasText = last.parts.some(
    (part) => part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '',
  );
  const meta = last.metadata as MessageMetadata | undefined;
  return hasText || hasTokenCount(meta?.usage?.tokens);
}

/**
 * Return `messages` with the LAST assistant message's `metadata.usage.incompleteReason` set to
 * `reason`, preserving every other usage field (any captured tokens/price) and the `createdAt`
 * stamped at stream start. When `modelId` is given and the message has no captured `usage.modelId`,
 * stamps it so an incomplete turn still shows which model was stopped; a real provider-reported
 * id is never overwritten. Creates a minimal `usage` block when the message has none. Pure: the input
 * is never mutated; a new array with a new trailing message is returned. Returns the input unchanged
 * when the last message is not an assistant message.
 *
 * @param messages - The assembled turn messages.
 * @param reason - The synthesized incomplete reason to stamp.
 * @param modelId - The resolved `connectionId:model` id for the turn, stamped only when absent.
 * @returns The messages with the trailing assistant turn marked incomplete.
 */
export function markIncompleteTurn(
  messages: UIMessage[],
  reason: IncompleteReason,
  modelId?: string,
): UIMessage[] {
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  if (!last || last.role !== 'assistant') return messages;
  const meta = (last.metadata ?? {}) as Partial<MessageMetadata>;
  // Conditional spread (exactOptionalPropertyTypes): add modelId only when absent and provided, so a
  // real finish-step model id is never overwritten and `undefined` is never assigned.
  const modelIdPatch =
    meta.usage?.modelId === undefined && modelId !== undefined ? { modelId } : {};
  const usage: UsageMetadata = { ...meta.usage, ...modelIdPatch, incompleteReason: reason };
  const nextMeta = { ...meta, usage } as MessageMetadata;
  const out = messages.slice();
  out[lastIndex] = { ...last, metadata: nextMeta };
  return out;
}
