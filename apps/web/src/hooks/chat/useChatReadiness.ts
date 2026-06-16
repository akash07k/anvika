import type { ModelInfo } from '@anvika/shared/models/model-info';
import type { RedactedConnection, RedactedSettings } from '@anvika/shared/settings/redact';

import { parseConnectionId } from '../../components/connections/connectionsWire';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModels } from '../conversation/useModels';

/** The four states of chat readiness consumed by the conversation surface. */
export type ChatReadiness = 'loading' | 'unconfigured' | 'model-unavailable' | 'ready';

/**
 * Whether a connection has the credentials its type needs to be usable. A native
 * key-based type needs its `apiKey` set; `azure` additionally needs a `resourceName` or `baseUrl`;
 * `openai-compatible` only needs its `baseUrl` (its key is optional). The narrowing casts read
 * type-specific fields off the redacted union without widening to `any`.
 *
 * @param c - A redacted connection (secrets are `{ isSet }`, never plaintext).
 * @returns `true` when the connection carries enough configuration to be usable.
 */
function connectionConfigured(c: RedactedConnection): boolean {
  switch (c.type) {
    case 'openai-compatible':
      return Boolean((c as { baseUrl?: string }).baseUrl);
    case 'azure':
      return (
        Boolean(c.apiKey?.isSet) &&
        Boolean(
          (c as { resourceName?: string }).resourceName || (c as { baseUrl?: string }).baseUrl,
        )
      );
    default:
      return Boolean(c.apiKey?.isSet);
  }
}

/**
 * Derive chat readiness from the settings and the live model list. Pure (no React), so it is unit
 * tested directly. "Ready" requires all of: a non-empty `selectedModelId`, the owning connection
 * configured (see {@link connectionConfigured}), and the selected model present in the live
 * available-models list. The list membership is the authoritative signal (it implies
 * the connection was reachable); the configured check distinguishes the not-ready reasons.
 * `unconfigured` is the true first-run state (no model selected and no configured connection); any
 * other not-ready case is `model-unavailable` (configured, but the model is not currently usable),
 * which the surface treats as a recoverable notice rather than first-run. Readiness now keys on the
 * connection's configured-ness - there is no `local` special case.
 *
 * @param settingsStatus - The settings store hydration status.
 * @param settings - The redacted settings, or null before hydration.
 * @param modelsPending - Whether the models query is still on its first load.
 * @param models - The live available models, or undefined before they load.
 * @param effectiveModelId - The conversation's effective model (its override, else the settings
 *   default). Omitted (or undefined) falls back to `settings.selectedModelId`, so a surface with no
 *   per-conversation override keeps the original behavior. A conversation pinned to a now-unconfigured
 *   model resolves to `model-unavailable` (a recoverable notice), never a hard error.
 * @returns The resolved {@link ChatReadiness}.
 */
export function computeReadiness(
  settingsStatus: 'idle' | 'loading' | 'ready' | 'error',
  settings: RedactedSettings | null,
  modelsPending: boolean,
  models: ModelInfo[] | undefined,
  effectiveModelId?: string,
): ChatReadiness {
  if (settingsStatus !== 'ready' || settings === null) return 'loading';
  if (modelsPending) return 'loading';

  const selectedModelId = effectiveModelId ?? settings.selectedModelId;
  const hasSelectedModel = selectedModelId.length > 0;
  const connections = settings.connections;
  const anyConfigured = connections.some(connectionConfigured);
  const connectionId = parseConnectionId(selectedModelId);
  const connection = connections.find((c) => c.id === connectionId);
  const modelInList = (models ?? []).some((m) => m.id === selectedModelId);

  if (hasSelectedModel && connection && connectionConfigured(connection) && modelInList) {
    return 'ready';
  }
  if (!hasSelectedModel && !anyConfigured) return 'unconfigured';
  return 'model-unavailable';
}

/**
 * React hook: derive {@link ChatReadiness} from the settings store and the `useModels` query. Read
 * by the conversation surface to choose what to render and whether to enable the composer.
 *
 * @param effectiveModelId - The conversation's effective model (its override, else the settings
 *   default). Omitted falls back to the settings `selectedModelId` inside {@link computeReadiness}, so
 *   a surface with no per-conversation model keeps the original behavior.
 * @returns The current {@link ChatReadiness}.
 */
export function useChatReadiness(effectiveModelId?: string): ChatReadiness {
  const settingsStatus = useSettingsStore((s) => s.status);
  const settings = useSettingsStore((s) => s.settings);
  const { data: models, isPending } = useModels();
  return computeReadiness(settingsStatus, settings, isPending, models, effectiveModelId);
}
