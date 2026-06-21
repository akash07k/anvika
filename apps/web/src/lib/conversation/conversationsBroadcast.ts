import { ConversationIdSchema } from '@anvika/shared/conversation/id';
import { z } from 'zod';

/** The BroadcastChannel name all Anvika tabs share for cross-tab conversation sync. */
const CHANNEL_NAME = 'anvika-conversations';

/**
 * Strict schema for a cross-tab conversation broadcast: a discriminated union on `type`. Every variant
 * is CONTENT-SAFE - it carries only ids, never a title or message text - so a broadcast can never leak
 * conversation content across the channel. Each variant is a `z.strictObject` (the house pattern for a
 * fresh boundary literal, matching `diagnostics/events.ts`), so any extra field is rejected, hardening
 * the inbound trust boundary; `id` is the shared `ConversationIdSchema`, so a malformed id is dropped
 * consistently with every other conversation-id boundary.
 *
 * Forward-compat: because every variant is strict, a future field added to an EXISTING event must be
 * introduced as a NEW discriminator variant rather than bolted onto the current one - an old tab would
 * otherwise REJECT (not ignore) an enriched event, dropping it entirely. A new variant preserves
 * cross-version tab compatibility: old tabs ignore the unknown `type`, new tabs handle it.
 */
export const ConversationBroadcastSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('list-changed') }),
  z.strictObject({ type: z.literal('conversation-updated'), id: ConversationIdSchema }),
  z.strictObject({ type: z.literal('conversation-deleted'), id: ConversationIdSchema }),
]);

/** A validated cross-tab conversation broadcast event (one of the three content-safe variants). */
export type ConversationBroadcastEvent = z.infer<typeof ConversationBroadcastSchema>;

/**
 * Validate an inbound channel message against {@link ConversationBroadcastSchema}, returning the typed
 * event or `null` when it is malformed. The BroadcastChannel is a TRUST BOUNDARY, so every received
 * payload is `safeParse`d and a non-matching one is dropped safely.
 *
 * @param data - The raw `MessageEvent.data` from the channel.
 * @returns The validated {@link ConversationBroadcastEvent}, or `null` when the payload is malformed.
 */
export function parseConversationBroadcast(data: unknown): ConversationBroadcastEvent | null {
  const parsed = ConversationBroadcastSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** A handler invoked with each VALIDATED inbound broadcast event. */
export type ConversationBroadcastHandler = (event: ConversationBroadcastEvent) => void;

/**
 * A thin wrapper over a single shared {@link BroadcastChannel} for cross-tab conversation sync. It
 * feature-detects the API and no-ops where it is absent (older browsers, non-DOM test envs), so callers
 * never need to guard. A BroadcastChannel never receives its OWN posted messages, so `post` reaches
 * only OTHER tabs - exactly the cross-tab semantics we want.
 */
export interface ConversationsBroadcaster {
  /**
   * Post a content-safe event to the other tabs. A no-op when BroadcastChannel is unavailable; never
   * throws (a transient channel error must not break the local action that triggered it).
   *
   * @param event - The content-safe event to broadcast.
   */
  post(event: ConversationBroadcastEvent): void;
  /**
   * Subscribe to validated inbound events from other tabs. Malformed messages are dropped before the
   * handler runs. Returns an unsubscribe function; a no-op (returning a no-op) when the API is absent.
   *
   * @param handler - Called with each validated inbound event.
   * @returns An unsubscribe function.
   */
  subscribe(handler: ConversationBroadcastHandler): () => void;
  /** Close the underlying channel and clear handlers. Mainly for tests; the next use re-opens lazily. */
  dispose(): void;
}

/**
 * Create a {@link ConversationsBroadcaster} bound to the shared channel name. The channel is opened
 * lazily on first use and shared across all subscribers, so the app holds at most one channel.
 *
 * @returns The broadcaster.
 */
function createConversationsBroadcaster(): ConversationsBroadcaster {
  const handlers = new Set<ConversationBroadcastHandler>();
  let channel: BroadcastChannel | null = null;

  const onMessage = (event: MessageEvent): void => {
    const parsed = parseConversationBroadcast(event.data);
    // Drop malformed messages silently: a cross-tab message from our OWN app is near-impossible to be
    // malformed, so a defensive drop (no DiagnosticEvent, no logged payload) is correct and avoids scope creep.
    if (!parsed) return;
    for (const handler of handlers) handler(parsed);
  };

  const open = (): BroadcastChannel | null => {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!channel) {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', onMessage);
    }
    return channel;
  };

  return {
    post(event: ConversationBroadcastEvent): void {
      open()?.postMessage(event);
    },
    subscribe(handler: ConversationBroadcastHandler): () => void {
      open();
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    dispose(): void {
      if (channel) {
        channel.removeEventListener('message', onMessage);
        channel.close();
        channel = null;
      }
      handlers.clear();
    },
  };
}

/** The app-wide singleton broadcaster for cross-tab conversation sync. */
export const conversationsBroadcaster: ConversationsBroadcaster = createConversationsBroadcaster();
