import { REQUEST_ID_HEADER } from '@anvika/shared/chat';

/**
 * Mint a short, opaque, content-free correlation id for one chat turn (the first 8 hex chars of a
 * UUID). Short so a screen-reader user can read and relay it; unique enough to disambiguate the
 * handful of recent turns in one local log.
 *
 * @returns A fresh correlation id.
 */
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Start a chat turn: mint a fresh correlation id, store it in the caller's per-instance ref (so the
 * error handler can read the in-flight turn's id), and return the request header carrying it. The id
 * lives in the caller's ref - never module state - so concurrent turns (multiple conversations)
 * never clobber each other.
 *
 * @param ref - The caller's per-turn ref (a React `useRef`, or any `{ current: string }`).
 * @returns The request header record carrying {@link REQUEST_ID_HEADER}.
 */
export function beginTurn(ref: { current: string }): Record<string, string> {
  const id = newRequestId();
  ref.current = id;
  return { [REQUEST_ID_HEADER]: id };
}
