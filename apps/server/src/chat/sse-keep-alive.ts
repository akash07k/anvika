/** Interval, in milliseconds, between SSE keep-alive comments emitted while the upstream is idle. */
export const SSE_KEEP_ALIVE_MS = 15_000;

const KEEP_ALIVE_COMMENT = ': keep-alive\n\n';

/**
 * Re-stream an SSE byte stream, emitting an SSE keep-alive comment (`: keep-alive\n\n`, ignored by
 * SSE parsers) after every `intervalMs` gap with no upstream bytes. The idle timer resets on each
 * real chunk, so a comment is only ever emitted during a genuine quiet period (never mid-event
 * during active streaming). Upstream completion and errors are propagated; cancellation is forwarded.
 * Purpose: keep a streaming chat connection from idling out while a reasoning model thinks silently.
 *
 * @param source - The upstream SSE byte stream.
 * @param intervalMs - Idle gap before a keep-alive comment is emitted.
 * @returns A new byte stream that interleaves keep-alive comments during idle gaps.
 */
export function sseKeepAliveStream(
  source: ReadableStream<Uint8Array>,
  intervalMs: number,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const ping = new TextEncoder().encode(KEEP_ALIVE_COMMENT);
  let timer: ReturnType<typeof setInterval> | undefined;
  // Set when the consumer cancels the output (e.g. Bun drops the HTTP connection on client
  // disconnect). After that the output controller is no longer writable, so close()/enqueue()/
  // error() would throw; guarding on this (plus try/catch) keeps a routine disconnect or Stop from
  // becoming an unhandled rejection in the fire-and-forget pump.
  let cancelled = false;
  const clear = (): void => {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const arm = (): void => {
        timer = setInterval(() => {
          // If the consumer has gone away the enqueue throws; stop pinging in that case.
          try {
            controller.enqueue(ping);
          } catch {
            clear();
          }
        }, intervalMs);
      };
      const pump = async (): Promise<void> => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            clear();
            if (cancelled) return;
            controller.enqueue(value);
            arm();
          }
          clear();
          if (!cancelled) controller.close();
        } catch (error) {
          clear();
          // Surface a genuine upstream error only while the output is still writable. If the consumer
          // cancelled, the source read rejects/ends as a consequence and the controller is closed -
          // calling error() would throw, so swallow it (the disconnect is the real, benign outcome).
          if (!cancelled) {
            try {
              controller.error(error);
            } catch {
              /* output already closed or cancelled by the consumer */
            }
          }
        }
      };
      arm();
      void pump();
    },
    cancel(reason): Promise<void> {
      cancelled = true;
      clear();
      return reader.cancel(reason);
    },
  });
}

/**
 * Wrap an SSE {@link Response} so its body is kept alive with periodic comments during idle gaps
 * (see {@link sseKeepAliveStream}). Status, statusText, and headers are preserved. A response with
 * no body is returned unchanged.
 *
 * @param response - The streaming SSE response to wrap.
 * @param intervalMs - Idle gap before a keep-alive comment (default {@link SSE_KEEP_ALIVE_MS}).
 * @returns A response whose body emits keep-alive comments during silence.
 */
export function withSseKeepAlive(
  response: Response,
  intervalMs: number = SSE_KEEP_ALIVE_MS,
): Response {
  if (response.body === null) return response;
  return new Response(sseKeepAliveStream(response.body, intervalMs), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
