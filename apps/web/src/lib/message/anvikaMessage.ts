import type { UIMessage } from 'ai';
import type { MessageMetadata } from '@anvika/shared/chat/message-metadata';

/** A UIMessage carrying Anvika's typed message metadata: the `createdAt` timestamp and, on assistant turns, an optional content-safe `usage` block. */
export type AnvikaUIMessage = UIMessage<MessageMetadata>;

/**
 * The message's createdAt (epoch ms), or undefined if it predates the metadata (e.g. an old
 * persisted message). Callers fall back gracefully when undefined.
 *
 * @param message - The message to read the createdAt timestamp from.
 * @returns The createdAt epoch-millisecond timestamp, or undefined when absent.
 */
export function createdAtOf(message: AnvikaUIMessage): number | undefined {
  return message.metadata?.createdAt;
}

/**
 * The stable DOM/key handle for a message: its `id` when non-blank, else a positional fallback
 * `pos-<index>`. Both {@link MessageList} (heading id + React key) and the quick-nav/jump focus path
 * use this, so a message whose `id` is momentarily blank (a live local-provider turn before the
 * server heal lands) is still uniquely addressable and focusable instead of colliding on `""`.
 *
 * @param message - The message to derive a handle for.
 * @param index - The message's index in the conversation (the positional fallback).
 * @returns A non-empty handle, unique across the conversation.
 */
export function messageDomId(message: AnvikaUIMessage, index: number): string {
  const id = message.id;
  return typeof id === 'string' && id.trim() !== '' ? id : `pos-${index}`;
}
