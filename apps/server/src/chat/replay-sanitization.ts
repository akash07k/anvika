import {
  convertToModelMessages,
  pruneMessages,
  type ModelMessage,
  type ProviderMetadata,
  type UIMessage,
} from 'ai';

import type { MessageMetadata } from '@anvika/shared/chat/message-metadata';

/**
 * The replay-prep pipeline: what must be stripped from the persisted history before it is replayed
 * to a STATELESS model. Anvika sends the full conversation every turn with no `previousResponseId`
 * (ADR 0005/0003), so the persisted/displayed transcript and the replayed prompt diverge - several
 * things that belong in the record must never reach the model. Each transform here removes one such
 * thing, always against a copy (or by returning the same reference when nothing changed), leaving the
 * caller's original history intact for persistence and display:
 *
 * - `stripIncompleteTurns` drops assistant turns the user truncated or stopped, so the model is not
 *   nudged into awkwardly continuing a half-finished reply.
 * - `stripItemReferences` removes provider server-side item references (`itemId`) that would replay as
 *   dangling `item_reference` items the model cannot resolve.
 * - `pruneReasoningForReplay` drops reasoning artifacts (a model OUTPUT, never a required INPUT) that
 *   would otherwise break the next request.
 *
 * Every transform is content-safe: it reads only roles, part types, and provider keys - never message
 * text.
 */

/**
 * Return `messages` without any assistant turn marked incomplete (`metadata.usage.incompleteReason`
 * set). Such a turn is kept in the persisted transcript and shown to the user, but must NOT be
 * replayed to the model as context: a truncated or user-stopped reply in the prompt
 * can make the model awkwardly continue it. Pure; returns the SAME reference when nothing is
 * incomplete so a caller can skip work. Content-free: reads only role and the incomplete marker.
 *
 * @param messages - The conversation history about to be sent to the model.
 * @returns The history with incomplete assistant turns removed.
 */
export function stripIncompleteTurns(messages: UIMessage[]): UIMessage[] {
  let changed = false;
  const out = messages.filter((message) => {
    if (message.role !== 'assistant') return true;
    const meta = message.metadata as MessageMetadata | undefined;
    if (meta?.usage?.incompleteReason !== undefined) {
      changed = true;
      return false;
    }
    return true;
  });
  return changed ? out : messages;
}

/**
 * Remove provider server-side item references (`itemId`) from a COPY of the conversation history so a
 * stateless replay never sends a dangling reference. The OpenAI Responses provider stamps assistant
 * parts (reasoning AND text) with `providerMetadata.<provider>.itemId` (e.g. `rs_...`, `msg_...`);
 * on replay those become `{ type: 'item_reference', id }` items the model cannot resolve when the
 * referenced server-side item is gone or belongs to a different model/key (the
 * model-switch case). Anvika replays statelessly (ADR 0005/0003), so it must never emit such a
 * reference - the inline part content is the authoritative input.
 *
 * This strips ONLY the `itemId` metadata key from each part's `providerMetadata`, leaving every other
 * provider option intact; a namespace left empty is dropped. It is provider-agnostic (any namespace
 * carrying an `itemId`) and content-safe (touches only the `itemId` key, never message text). The
 * input is not mutated - a new array of new message/part objects is returned for the replay path,
 * while the caller keeps the original history for persistence/display.
 *
 * @param messages - The validated UIMessage history (not mutated).
 * @returns A copy with every `providerMetadata.*.itemId` removed.
 */
export function stripItemReferences(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (!('providerMetadata' in part) || part.providerMetadata === undefined) return part;
      const cleaned = withoutItemIds(part.providerMetadata);
      if (cleaned === part.providerMetadata) return part;
      if (Object.keys(cleaned).length > 0) return { ...part, providerMetadata: cleaned };
      // Stripping `itemId` emptied the bag - omit `providerMetadata` entirely rather than send an
      // empty `providerOptions: {}` to the model.
      const next = { ...part };
      delete next.providerMetadata;
      return next;
    }),
  }));
}

/**
 * Return a copy of provider metadata with every namespace's `itemId` removed, dropping a namespace
 * that becomes empty. Returns the SAME reference when nothing carried an `itemId`, so callers can
 * skip rebuilding the part.
 *
 * @param metadata - The part's provider metadata.
 * @returns The metadata without any `itemId`, or the original reference if none was present.
 */
function withoutItemIds(metadata: ProviderMetadata): ProviderMetadata {
  let changed = false;
  const result: ProviderMetadata = {};
  for (const [namespace, values] of Object.entries(metadata)) {
    if (!('itemId' in values)) {
      result[namespace] = values;
      continue;
    }
    changed = true;
    const rest = { ...values };
    delete rest.itemId;
    if (Object.keys(rest).length > 0) result[namespace] = rest;
  }
  return changed ? result : metadata;
}

/** The model messages to replay, plus how many assistant reasoning parts were removed. */
export interface PrunedReplay {
  /** The ModelMessages to send to the model, with all assistant reasoning parts removed. */
  messages: ModelMessage[];
  /** How many reasoning parts were removed (content-safe diagnostic; 0 means nothing was pruned). */
  prunedReasoning: number;
}

/**
 * Build the model messages for one stateless replay turn, removing reasoning artifacts that would
 * otherwise break the request. Anvika replays the full conversation history every turn (no
 * `previousResponseId`); reasoning/thinking models attach provider-specific artifacts (OpenAI's
 * server-side reasoning item id `rs_...`, DeepSeek `reasoning_content`, etc.) to their assistant
 * turns, and replaying those breaks the next request. Reasoning is a model OUTPUT, never
 * a required INPUT, so we drop it from the replayed messages with the AI SDK's own `pruneMessages`
 * (`reasoning: 'all'`). Only the replay copy is pruned - the persisted/displayed history (carried by
 * `originalMessages` in the caller) is untouched.
 *
 * Content-safe: reads no message text, only part `type` and a count.
 *
 * @param messages - The full validated UIMessage history (not mutated).
 * @returns The pruned ModelMessages plus the count of reasoning parts removed.
 */
export async function pruneReasoningForReplay(messages: UIMessage[]): Promise<PrunedReplay> {
  const converted = await convertToModelMessages(messages);
  const prunedReasoning = countReasoningParts(converted);
  return {
    messages: pruneMessages({ messages: converted, reasoning: 'all' }),
    prunedReasoning,
  };
}

/** Count assistant reasoning parts in converted ModelMessages (content-safe: inspects `type` only). */
function countReasoningParts(messages: ModelMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === 'reasoning') count += 1;
    }
  }
  return count;
}
