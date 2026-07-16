import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  conversationsBroadcaster,
  parseConversationBroadcast,
  type ConversationBroadcastEvent,
} from './conversationsBroadcast';

describe('parseConversationBroadcast', () => {
  it('parses a list-changed event', () => {
    expect(parseConversationBroadcast({ type: 'list-changed' })).toEqual({ type: 'list-changed' });
  });

  it('parses a conversation-updated event with id', () => {
    const event = { type: 'conversation-updated', id: 'abc-123' };
    expect(parseConversationBroadcast(event)).toEqual(event);
  });

  it('parses a conversation-deleted event with id', () => {
    const event = { type: 'conversation-deleted', id: 'abc-123' };
    expect(parseConversationBroadcast(event)).toEqual(event);
  });

  it('returns null for an unknown discriminator', () => {
    expect(parseConversationBroadcast({ type: 'nope' })).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    expect(parseConversationBroadcast({ type: 'conversation-updated' })).toBeNull();
    expect(parseConversationBroadcast({ type: 'conversation-deleted' })).toBeNull();
  });

  it('returns null for a wrong field type (id not a string)', () => {
    expect(parseConversationBroadcast({ type: 'conversation-updated', id: 7 })).toBeNull();
    expect(parseConversationBroadcast({ type: 'conversation-deleted', id: 7 })).toBeNull();
  });

  it('returns null for a malformed conversation id (not the canonical xxx-xxx format)', () => {
    expect(parseConversationBroadcast({ type: 'conversation-updated', id: 'bad' })).toBeNull();
    expect(parseConversationBroadcast({ type: 'conversation-deleted', id: 'ABC-123' })).toBeNull();
  });

  it('returns null when an extra field is present (strict schema)', () => {
    expect(parseConversationBroadcast({ type: 'list-changed', extra: 1 })).toBeNull();
    expect(
      parseConversationBroadcast({ type: 'conversation-updated', id: 'abc-123', revision: 1 }),
    ).toBeNull();
    expect(
      parseConversationBroadcast({ type: 'conversation-deleted', id: 'abc-123', extra: true }),
    ).toBeNull();
  });

  it('returns null for non-object inputs', () => {
    expect(parseConversationBroadcast(null)).toBeNull();
    expect(parseConversationBroadcast(undefined)).toBeNull();
    expect(parseConversationBroadcast('list-changed')).toBeNull();
    expect(parseConversationBroadcast(42)).toBeNull();
  });
});

const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

describe.skipIf(!hasBroadcastChannel)('conversationsBroadcaster round-trip', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    conversationsBroadcaster.dispose();
  });

  it('delivers a posted event to a separate subscriber instance', async () => {
    // A second BroadcastChannel of the same name receives what the broadcaster posts: a channel never
    // receives its OWN posts, so a separate listener instance is required to observe the round-trip.
    const listener = new BroadcastChannel('anvika-conversations');
    cleanups.push(() => listener.close());
    // Await the actual message delivery rather than a fixed macrotask: cross-instance BroadcastChannel
    // delivery is async and a single `setTimeout(0)` can race under load. A 1s guard avoids a hang.
    const delivered = new Promise<ConversationBroadcastEvent | null>((resolve) => {
      listener.addEventListener(
        'message',
        (e: MessageEvent) => resolve(parseConversationBroadcast(e.data)),
        { once: true },
      );
      setTimeout(() => resolve(null), 1000);
    });

    conversationsBroadcaster.post({ type: 'conversation-updated', id: 'jwq-112' });

    expect(await delivered).toEqual({ type: 'conversation-updated', id: 'jwq-112' });
  });

  it('stops delivering to a handler after it unsubscribes', async () => {
    const handled: ConversationBroadcastEvent[] = [];
    const unsubscribe = conversationsBroadcaster.subscribe((e) => handled.push(e));
    unsubscribe();
    const sender = new BroadcastChannel('anvika-conversations');
    cleanups.push(() => sender.close());

    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    sender.postMessage({ type: 'list-changed' });
    await new Promise((r) => setTimeout(r, 0));

    expect(handled).toEqual([]);
  });

  it('invokes a subscribed handler with a parsed inbound event and drops malformed ones', async () => {
    const handled: ConversationBroadcastEvent[] = [];
    const unsubscribe = conversationsBroadcaster.subscribe((e) => handled.push(e));
    cleanups.push(unsubscribe);
    const sender = new BroadcastChannel('anvika-conversations');
    cleanups.push(() => sender.close());

    // BroadcastChannel.postMessage takes a single arg; the targetOrigin rule (Window/MessagePort) misfires.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    sender.postMessage({ type: 'list-changed' });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    sender.postMessage({ type: 'garbage' });
    await new Promise((r) => setTimeout(r, 0));

    expect(handled).toEqual([{ type: 'list-changed' }]);
  });
});

describe('conversationsBroadcaster no-op safety', () => {
  it('post and subscribe do not throw when BroadcastChannel is undefined', () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error - deliberately remove the global to exercise the feature-detect path.
    delete globalThis.BroadcastChannel;
    conversationsBroadcaster.dispose();
    try {
      const unsubscribe = conversationsBroadcaster.subscribe(vi.fn());
      expect(() => conversationsBroadcaster.post({ type: 'list-changed' })).not.toThrow();
      expect(() => unsubscribe()).not.toThrow();
    } finally {
      globalThis.BroadcastChannel = original;
      conversationsBroadcaster.dispose();
    }
  });
});
