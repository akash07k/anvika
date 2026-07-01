import { z } from 'zod';

import type { Connection } from '@anvika/shared/settings/connection';

import { serverLogger } from '../../logging/logger';
import { listingRequest } from './listing-endpoint';
import { fetchJson, type DiscoveryOptions } from './shared';

const OpenAiModelsSchema = z.object({
  data: z.array(z.object({ id: z.string() })).optional(),
});

/**
 * The chat-model allowlist heuristic. OpenAI's `/v1/models` mixes chat, embedding, audio, and image
 * models with no capability field (docs/research/model-discovery.md), so membership is filtered to ids
 * matching a chat-family prefix. Models the heuristic misses can still be added via a connection's
 * `manualModelIds` escape hatch (ADR 0023).
 */
const CHAT_ID_PATTERN = /^(gpt-|o1|o3|o4|chatgpt-)/;

/**
 * Non-chat exclusions the `gpt-` allowlist would otherwise admit. OpenAI ships image, audio,
 * realtime, transcribe, tts, embedding, and moderation models whose ids also begin with `gpt-`
 * (e.g. `gpt-image-1`, `gpt-4o-audio-preview`, `gpt-4o-realtime-preview`, `gpt-4o-transcribe`). They
 * cannot serve a chat turn, so they are dropped AFTER the allowlist (docs/research/model-discovery.md).
 * A model the heuristic wrongly drops can still be re-added via a connection's `manualModelIds`
 * escape hatch (ADR 0023).
 */
const NON_CHAT_ID_PATTERN = /image|audio|realtime|transcribe|tts|embedding|moderation/;

/**
 * Discover an OpenAI connection's chat models via `GET {base}/v1/models` (Bearer key), keeping only ids
 * matching the chat-family allowlist {@link CHAT_ID_PATTERN} and NOT matching the non-chat denylist
 * {@link NON_CHAT_ID_PATTERN}. Zod-validated at the boundary; any failure yields `[]`. Never logs the
 * key. Returns BARE model ids.
 *
 * @param connection - The openai connection (must carry an apiKey; caller skips it otherwise).
 * @param opts - Injectable fetch/timeout for tests.
 * @returns The discovered bare model ids, or `[]`.
 */
export async function discoverOpenAiModelIds(
  connection: Extract<Connection, { type: 'openai' }>,
  opts: DiscoveryOptions = {},
): Promise<string[]> {
  if (!connection.apiKey) return [];
  const { url, headers } = listingRequest(connection, connection.apiKey);
  const body = await fetchJson(url, { headers }, opts);
  const parsed = OpenAiModelsSchema.safeParse(body);
  if (!parsed.success || !parsed.data.data) {
    serverLogger('models').debug('openai discovery returned no model list');
    return [];
  }
  return parsed.data.data
    .map((m) => m.id)
    .filter((id) => CHAT_ID_PATTERN.test(id) && !NON_CHAT_ID_PATTERN.test(id));
}
