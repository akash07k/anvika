import type { UIMessage } from 'ai';

import { serverLogger } from '../logging/logger';

/** A logged conversation fragment: which role spoke and its full text. */
export interface ChatContentEntry {
  /** Whose message this is. */
  role: 'user' | 'assistant';
  /** The full message text (no truncation). */
  text: string;
}

/** Emit a single content entry. */
export type ChatContentSink = (entry: ChatContentEntry) => void;

/**
 * Default content sink: writes the message text under the `anvika.server.chat` category at
 * info level. Only ever called when content logging is enabled, so this is the one place
 * message text reaches the logs.
 *
 * @param entry - The role and full text to log.
 */
export const defaultChatContentSink: ChatContentSink = (entry) => {
  serverLogger('chat').info(`${entry.role} message`, { text: entry.text });
};

/**
 * Concatenate the text parts of a UI message into a single string (non-text parts contribute
 * nothing currently).
 *
 * @param message - The UI message.
 * @returns The joined text.
 */
export function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

/**
 * The text of the most recent user message in a conversation, or an empty string if there is
 * none. Used to log what the user just sent.
 *
 * @param messages - The conversation messages.
 * @returns The latest user message text.
 */
export function latestUserText(messages: readonly UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message && message.role === 'user') return messageText(message);
  }
  return '';
}
