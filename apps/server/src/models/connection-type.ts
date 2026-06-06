import type { ConnectionType } from '@anvika/shared/settings/connection';
import type { Settings } from '@anvika/shared/settings/schema';

/** A parsed namespaced model id. */
export interface ParsedModelId {
  /** The connection id (everything before the first colon). */
  connectionId: string;
  /** The provider-native model id (everything after the first colon). */
  model: string;
}

/**
 * Parse a namespaced `connectionId:model` id, splitting on the FIRST colon only (a model id may
 * itself contain colons). The single sanctioned SERVER-SIDE parser - no other server code may infer
 * meaning from a model id's prefix. The web client has its own `parseConnectionId`
 * (apps/web/src/components/connections/connectionsWire.ts) which mirrors this colon handling
 * (rejecting both a colonless id and a trailing-colon id). Returns null when there is no colon, or
 * when the colon is leading (empty connection id) or trailing (empty model).
 *
 * @param modelId - The namespaced model id.
 * @returns The parsed parts, or null when unparseable.
 */
export function parseModelId(modelId: string): ParsedModelId | null {
  const idx = modelId.indexOf(':');
  if (idx <= 0 || idx === modelId.length - 1) return null;
  return { connectionId: modelId.slice(0, idx), model: modelId.slice(idx + 1) };
}

/**
 * Resolve a connection id to its connection TYPE via settings. The prefix of a model id is a
 * connection id, never a provider name; any code needing the provider type (price lookup,
 * capability gating, logging) goes through here. Returns null when no connection has that id.
 *
 * @param settings - The validated settings.
 * @param connectionId - The connection id (a model-id prefix).
 * @returns The connection type, or null.
 */
export function connectionTypeFor(settings: Settings, connectionId: string): ConnectionType | null {
  return settings.connections.find((c) => c.id === connectionId)?.type ?? null;
}
