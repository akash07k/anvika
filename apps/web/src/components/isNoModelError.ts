import { ApiClientError } from '../lib/api-client';

/**
 * Detect whether a chat error means no model is configured, so the conversation surface can point
 * the user to Settings instead of offering only a generic Retry. Prefers the typed
 * {@link ApiClientError} `code` (`unconfigured`) carried by the chat transport, and falls back to a
 * message match so the same UX applies even if the error arrives untyped. The fallback matches the
 * stable "a model in Settings" suffix so it covers BOTH server messages - "Choose a model in
 * Settings." and "...select a model in Settings." (the registry emits either).
 *
 * @param error - The chat hook's current error, if any.
 * @returns `true` when the error indicates an unconfigured model.
 */
export function isNoModelError(error: Error | undefined): boolean {
  if (!error) return false;
  if (error instanceof ApiClientError && error.code === 'unconfigured') return true;
  return /a model in settings/i.test(error.message);
}
