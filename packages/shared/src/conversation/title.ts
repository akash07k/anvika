import type { UIMessage } from 'ai';

/** The placeholder title for a conversation with no user text yet. */
export const NEW_CONVERSATION_TITLE = 'New conversation';

/**
 * Hard cap (chars) on a STORED conversation title - the bound the rename request schema, the AI-retitle
 * result schema, and the server-side `Branch of <title>` builder all enforce so they cannot diverge.
 * Distinct from {@link MAX_TITLE_LENGTH} (the softer cap on an auto-derived title).
 */
export const MAX_STORED_TITLE_LENGTH = 200;

/** Soft cap on a derived title's length, in characters. */
const MAX_TITLE_LENGTH = 60;

/**
 * Derive a stable, human-readable conversation title from its messages: the first user
 * message's text, whitespace-collapsed and capped at {@link MAX_TITLE_LENGTH} characters on a
 * word boundary. Falls back to {@link NEW_CONVERSATION_TITLE} when there is no user text yet.
 * Pure (no I/O); used on the server (persistence write/branch and the AI retitle path) and in the
 * client optimistic insert, so both sides derive the same title.
 *
 * @param messages - The conversation messages.
 * @returns The derived title.
 */
export function deriveConversationTitle(messages: readonly UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = firstUser?.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return NEW_CONVERSATION_TITLE;
  if (text.length <= MAX_TITLE_LENGTH) return text;
  const slice = text.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}
