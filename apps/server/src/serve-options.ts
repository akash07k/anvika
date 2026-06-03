/**
 * Per-connection idle timeout, in seconds, for the streaming chat response. Reasoning models
 * (for example a DeepSeek deployment) emit no bytes while they "think" before the first token, so
 * the connection is idle during that phase. Bun's default `idleTimeout` is 10 seconds, which aborts
 * such a turn mid-stream (the client is left showing "generating" with no response). 255 is Bun's
 * maximum, giving the model ample silent-thinking headroom before the connection is reclaimed.
 */
export const STREAM_IDLE_TIMEOUT_SECONDS = 255;

/** The subset of `Bun.serve` options this app sets when binding the HTTP listener. */
export interface AppServeOptions {
  /** TCP port to bind. */
  port: number;
  /** Bind address; loopback only (the app is self-hosted and single-user). */
  hostname: string;
  /** Per-connection idle timeout in seconds; see {@link STREAM_IDLE_TIMEOUT_SECONDS}. */
  idleTimeout: number;
  /** The Hono `app.fetch` request handler. */
  fetch: (request: Request) => Response | Promise<Response>;
}

/**
 * Build the `Bun.serve` options for the app listener. Sets `idleTimeout` to
 * {@link STREAM_IDLE_TIMEOUT_SECONDS} so a reasoning model's silent thinking phase (no bytes on the
 * wire before the first token) does not trip Bun's 10-second default and abort the streamed turn.
 * Kept dependency-free (no DB or runtime imports) so the configuration is unit-testable under vitest.
 *
 * @param port - The TCP port to bind.
 * @param fetch - The Hono `app.fetch` handler.
 * @returns The options object passed to `Bun.serve`.
 */
export function buildServeOptions(
  port: number,
  fetch: (request: Request) => Response | Promise<Response>,
): AppServeOptions {
  return { port, hostname: '127.0.0.1', idleTimeout: STREAM_IDLE_TIMEOUT_SECONDS, fetch };
}
