import { ApiErrorSchema } from '@anvika/shared/errors';

import { ApiClientError } from '../api-client';

/**
 * A `fetch` for the chat transport that converts a canonical API-error response ({ code, message,
 * details }) into a thrown {@link ApiClientError}, so `useChat`'s `error` carries the server `code`
 * and the server's message. Non-canonical non-ok responses pass through for the AI SDK's own
 * handling. AI SDK v6.0.197 `DefaultChatTransport` accepts a `fetch` option.
 *
 * @param input - The request info or URL, as accepted by the global `fetch`.
 * @param init - Optional request init options.
 * @returns The original {@link Response} when ok or non-canonical.
 * @throws ApiClientError When the non-ok body matches the canonical {@link ApiErrorSchema}.
 */
export const chatFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.ok) return res;
  const json: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const parsed = ApiErrorSchema.safeParse(json);
  if (parsed.success) {
    throw new ApiClientError(parsed.data.code, parsed.data.message, parsed.data.details);
  }
  return res;
};
