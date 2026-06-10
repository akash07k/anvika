import { afterEach, describe, expect, it, vi } from 'vitest';

import { sseKeepAliveStream, withSseKeepAlive } from './sse-keep-alive';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Build a source byte stream whose enqueue/close are driven manually via the returned controller,
 * so a test can write upstream chunks and close at precise points relative to the fake clock.
 */
function controlledSource(): {
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array>;
} {
  let captured: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      captured = controller;
    },
  });
  if (captured === undefined) throw new Error('controller was not captured');
  return { stream, controller: captured };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sseKeepAliveStream', () => {
  it('passes upstream chunks through unchanged', async () => {
    vi.useFakeTimers();
    const source = controlledSource();
    const wrapped = sseKeepAliveStream(source.stream, 1000);
    const reader = wrapped.getReader();

    const data = 'data: {"x":1}\n\n';
    source.controller.enqueue(encoder.encode(data));
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toBe(data);

    source.controller.close();
    const next = await reader.read();
    expect(next.done).toBe(true);
  });

  it('emits a keep-alive comment after an idle interval', async () => {
    vi.useFakeTimers();
    const source = controlledSource();
    const wrapped = sseKeepAliveStream(source.stream, 1000);
    const reader = wrapped.getReader();

    await vi.advanceTimersByTimeAsync(1000);
    const ping = await reader.read();
    expect(ping.done).toBe(false);
    expect(decoder.decode(ping.value)).toBe(': keep-alive\n\n');

    await vi.advanceTimersByTimeAsync(1000);
    const ping2 = await reader.read();
    expect(ping2.done).toBe(false);
    expect(decoder.decode(ping2.value)).toBe(': keep-alive\n\n');
  });

  it('resets the idle timer on each real chunk (no ping during active streaming)', async () => {
    vi.useFakeTimers();
    const source = controlledSource();
    const wrapped = sseKeepAliveStream(source.stream, 1000);
    const reader = wrapped.getReader();

    const a = 'data: a\n\n';
    const b = 'data: b\n\n';
    source.controller.enqueue(encoder.encode(a));
    await vi.advanceTimersByTimeAsync(600); // < interval since last chunk: no ping
    source.controller.enqueue(encoder.encode(b));
    await vi.advanceTimersByTimeAsync(600); // < interval since chunk b: still no ping

    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe(a);
    const second = await reader.read();
    // The chunk immediately after `a` must be the real `b`, not an interleaved keep-alive comment.
    expect(decoder.decode(second.value)).toBe(b);
  });

  it('propagates upstream completion and emits no ping afterward', async () => {
    vi.useFakeTimers();
    const source = controlledSource();
    const wrapped = sseKeepAliveStream(source.stream, 1000);
    const reader = wrapped.getReader();

    source.controller.close();
    const done = await reader.read();
    expect(done.done).toBe(true);

    // Advancing the clock after close must not enqueue any further chunk.
    await vi.advanceTimersByTimeAsync(5000);
    const after = await reader.read();
    expect(after.done).toBe(true);
  });

  it('forwards consumer cancellation to the source without an unhandled rejection', async () => {
    // Real timers: this exercises the disconnect path and lets any deferred rejection surface.
    vi.useRealTimers();
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      let cancelledReason: unknown;
      const source = new ReadableStream<Uint8Array>({
        start() {
          /* stays open and idle, so the pump is parked on `reader.read()` */
        },
        cancel(reason) {
          cancelledReason = reason;
        },
      });
      const wrapped = sseKeepAliveStream(source, 1000);
      const reader = wrapped.getReader();
      const pending = reader.read(); // the pump is now awaiting the source read

      await reader.cancel('client disconnected'); // the consumer goes away
      const result = await pending; // resolves done; must not throw
      expect(result.done).toBe(true);
      expect(cancelledReason).toBe('client disconnected'); // cancellation forwarded to the source

      // Give the fire-and-forget pump a tick to settle; closing/erroring a cancelled output must not
      // surface as an unhandled rejection.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('withSseKeepAlive', () => {
  it('preserves status and headers of the wrapped streaming response', () => {
    const source = controlledSource();
    const input = new Response(source.stream, {
      status: 202,
      headers: { 'content-type': 'text/event-stream' },
    });
    const wrapped = withSseKeepAlive(input, 1000);
    expect(wrapped.status).toBe(202);
    expect(wrapped.headers.get('content-type')).toBe('text/event-stream');
    expect(wrapped.body).not.toBeNull();
  });

  it('returns a null-body response unchanged', () => {
    const input = new Response(null, { status: 204 });
    const wrapped = withSseKeepAlive(input, 1000);
    expect(wrapped).toBe(input);
  });
});
