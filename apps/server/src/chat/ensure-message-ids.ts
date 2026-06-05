import type { UIMessage } from 'ai';

/**
 * Return `messages` with every blank or missing `id` filled by `generateId`, leaving non-empty ids
 * untouched. Content-free: it reads only the `id` field, never message text. Pure - the input array
 * and its messages are never mutated; a NEW array (with new objects for the filled entries) is
 * returned only when at least one id changed, and the SAME reference is returned otherwise so a
 * caller can detect "nothing healed" by reference identity.
 *
 * @param messages - The messages to normalise.
 * @param generateId - A unique-id generator (the `ai` `generateId`, or a stub in tests).
 * @returns The messages with all ids non-empty; the same reference when no id needed filling.
 */
export function ensureMessageIds(messages: UIMessage[], generateId: () => string): UIMessage[] {
  let changed = false;
  const out = messages.map((message) => {
    const id = message.id;
    if (typeof id === 'string' && id.trim() !== '') return message;
    changed = true;
    return { ...message, id: generateId() };
  });
  return changed ? out : messages;
}
