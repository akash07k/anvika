import type { UIMessage } from 'ai';

/** Concatenate the text parts of a message into a single plain string. */
export function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}
