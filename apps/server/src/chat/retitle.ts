import { generateText, type UIMessage } from 'ai';

import { deriveConversationTitle } from '@anvika/shared/conversation/title';

import { serverLogger } from '../logging/logger';
import { messageText } from './content-log';
import type { ResolvedChatModel } from './resolve-model';

/** Soft cap on a regenerated title's length, in characters (mirrors `deriveConversationTitle`). */
const MAX_TITLE_LENGTH = 60;

/** The tight system prompt steering the model to emit only a short, bare title. */
const SYSTEM_PROMPT = 'Reply with only a short, specific title, at most 8 words, no quotes.';

/** Input for {@link retitleConversation}. */
export interface RetitleConversationInput {
  /** Resolve the chat model from its id; mirrors the chat route's resolver. Tests inject a mock. */
  resolveModel: (modelId: string) => ResolvedChatModel | Promise<ResolvedChatModel>;
  /** The conversation's full message history; only sampled text parts are sent to the model. */
  messages: readonly UIMessage[];
}

/**
 * Collapse whitespace and cap `text` at {@link MAX_TITLE_LENGTH} characters on a word boundary,
 * mirroring `deriveConversationTitle` so an over-long model output is trimmed the same way the
 * auto-derived title is. Pure (no I/O).
 *
 * @param text - The candidate title.
 * @returns The collapsed, word-boundary-capped title.
 */
function capAtWordBoundary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed;
  const slice = collapsed.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

/**
 * Build a bounded, drift-aware sample of conversation turns: the FIRST user message, the
 * MOST-RECENT user message, and the LATEST assistant message (optional). When the first user turn
 * is also the most-recent user turn (a single user turn so far), it is included exactly once. Only
 * text parts contribute; no other turns are ever sampled. This keeps the model call cheap and
 * captures topic drift between the conversation's start and its current state.
 *
 * @param messages - The conversation history.
 * @returns The sampled turns as `{ role, text }`, in chronological order, text parts only.
 */
function buildSample(
  messages: readonly UIMessage[],
): { role: 'user' | 'assistant'; text: string }[] {
  const firstUser = messages.find((m) => m.role === 'user');
  const reversed = messages.toReversed();
  const recentUser = reversed.find((m) => m.role === 'user');
  const latestAssistant = reversed.find((m) => m.role === 'assistant');

  const sample: { role: 'user' | 'assistant'; text: string }[] = [];
  if (firstUser) sample.push({ role: 'user', text: messageText(firstUser) });
  // Include the most-recent user turn only when it is a DIFFERENT message than the first (single
  // user turn so far -> include once).
  if (recentUser && recentUser !== firstUser) {
    sample.push({ role: 'user', text: messageText(recentUser) });
  }
  if (latestAssistant) sample.push({ role: 'assistant', text: messageText(latestAssistant) });
  return sample;
}

/**
 * Regenerate a conversation title on demand via a non-streaming `generateText` call over a bounded,
 * drift-aware sample (first user, most-recent user, latest assistant). The model output is trimmed,
 * stripped of surrounding quotes, and capped at a word boundary, then returned. This is a DELIBERATE
 * second model seam alongside the chat `streamText` (the auto-derived title stays as-is; this lets
 * the user regenerate a better one).
 *
 * Content-safety: the sample text and the resulting title are NEVER logged here (the route logs only
 * the id/owner and content-safe outcome). An unconfigured model surfaces by letting the resolver's
 * `ChatProviderUnconfiguredError` propagate, so the route maps it to the same `unconfigured` API
 * error the chat route uses.
 *
 * Always returns a non-empty title: a blank model response (e.g. retitling an empty-messages draft
 * row, which the reasoning create-if-absent path can produce) would cap to an empty string and make
 * the route's `RetitleResultSchema` reject the body with an uncaught error; falling back to the
 * messages-derived title (itself `NEW_CONVERSATION_TITLE` for an empty draft) keeps the response valid.
 *
 * @param input - The model resolver and the conversation messages to sample.
 * @returns The trimmed, quote-stripped, word-boundary-capped title (never empty).
 */
export async function retitleConversation(input: RetitleConversationInput): Promise<string> {
  // Resolve with an empty id so the settings-selected model is used (the resolver's fallback);
  // a thrown ChatProviderUnconfiguredError propagates to the route, matching the chat path.
  const resolved = await input.resolveModel('');
  const sample = buildSample(input.messages);
  const prompt = sample.map((turn) => `${turn.role}: ${turn.text}`).join('\n\n');

  const result = await generateText({
    model: resolved.model,
    system: SYSTEM_PROMPT,
    prompt,
  });

  // Strip surrounding matched quotes (straight or smart) before the word-boundary cap.
  const unquoted = result.text.trim().replace(/^["'“‘](.*)["'”’]$/s, '$1');
  const capped = capAtWordBoundary(unquoted);
  if (capped === '') {
    // Content-safe: the empty model text and the derived title are never logged.
    serverLogger('conversation').warning('retitle model returned empty; using derived title');
    return deriveConversationTitle(input.messages);
  }
  return capped;
}
