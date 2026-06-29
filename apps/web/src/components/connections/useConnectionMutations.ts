import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { RedactedConnection, RedactedSettings } from '@anvika/shared/settings/redact';

import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from '../../hooks/conversation/useModels';
import { useSetConnectionSecret } from '../../hooks/connections/useSetConnectionSecret';
import { notify } from '../../notifications/notifier';

import type { ConnectionMutations, UseConnectionMutationsInput } from './connectionMutations.types';
import {
  buildConnectionsPatch,
  modelBelongsToConnection,
  optimisticConnections,
  redactedToPublic,
} from './connectionsWire';

/**
 * Connection PATCHes pass this so only the fieldset's precise `connectionSaved`/`connectionRemoved`
 * announcement speaks - the store's generic "Settings saved" would otherwise double-announce.
 */
const SILENT = { announce: false } as const;

/**
 * The mutation orchestration for the connections fieldset: it owns the secret PUT, the silent
 * shared-dispatcher wrapper, and the save/remove handlers, keeping all FOCUS choreography in the
 * owning component (which threads in the focus arming callbacks). Separating the mutation flow from
 * the focus management keeps each unit within the size cap and single-responsibility (ADR 0007).
 *
 * @param input - The connections, settings, shared dispatcher, and the form/focus state setters.
 * @returns The save, remove, and enable-toggle orchestrators.
 */
export function useConnectionMutations(input: UseConnectionMutationsInput): ConnectionMutations {
  const {
    connections,
    settings,
    onPatch,
    setForm,
    setFocusSavedId,
    setFocusOpenerId,
    focusAfterRemove,
    setRemoveId,
  } = input;
  const secretMutation = useSetConnectionSecret();

  // Every connection PATCH is silent (SILENT) so only this fieldset's own announcement speaks.
  // `extra` carries the with-secret hints: `skipModelsInvalidation` (the secret PUT owns the single
  // models invalidation, so the keyless public PATCH must not) and `pendingSecretLabel` - a content-
  // safe LABEL (never the secret) so an invalid-file overwrite can warn the key was not written.
  const dispatch = (
    wire: Record<string, unknown>,
    optimistic: (settings: RedactedSettings) => RedactedSettings,
    extra?: { skipModelsInvalidation?: boolean; pendingSecretLabel?: string },
  ): Promise<boolean> => onPatch(wire, optimistic, { ...SILENT, ...extra });

  const handleSubmit = async ({
    connection,
    secret,
  }: {
    connection: PublicConnection;
    secret: SetConnectionSecret | null;
  }): Promise<void> => {
    const wire = buildConnectionsPatch(connections, connection);
    // When a secret will be written, defer the single models invalidation to the secret PUT: the
    // public PATCH here is keyless, so its invalidation would be premature and immediately stale.
    // With no secret, the public PATCH's own single invalidation is correct (do not skip).
    const ok = await dispatch(
      { connections: wire },
      (s) => ({ ...s, connections: optimisticConnections(s.connections, connection, secret) }),
      // Pass the content-safe label only on a with-secret save so an invalid-file overwrite can warn
      // the key still needs re-entering; add/no-secret saves carry neither hint (unchanged).
      secret ? { skipModelsInvalidation: true, pendingSecretLabel: connection.label } : undefined,
    );
    setForm(null);
    if (!ok) {
      // The public PATCH failed and the Save button is unmounting; re-arm focus to the form's
      // opener - the edited row's Edit button if that row still exists, else the Add button - so focus
      // does not fall to <body>. The store already announced the failure.
      setFocusOpenerId(connections.some((c) => c.id === connection.id) ? connection.id : null);
      return;
    }
    if (secret) {
      try {
        await secretMutation.mutateAsync({ id: connection.id, patch: secret });
      } catch {
        // The public PATCH deferred its models invalidation to this secret PUT. The PUT failed,
        // but the public config already committed (a new connection, or a baseUrl/manualModelIds
        // change that affects discovery), so invalidate here - neither call did, leaving the picker
        // stale (useModels has a 5-min staleTime and suppresses refocus refetches).
        void queryClient.invalidateQueries({ queryKey: modelsQueryKey });
        notify({ type: 'connectionSaveFailed', label: connection.label });
        setFocusSavedId(connection.id);
        return;
      }
    }
    notify({ type: 'connectionSaved', label: connection.label });
    setFocusSavedId(connection.id);
  };

  const confirmRemove = async (target: RedactedConnection): Promise<void> => {
    const modelCleared = modelBelongsToConnection(settings.selectedModelId, target.id);
    const wire = buildConnectionsPatch(connections, null, target.id);
    const clear = modelCleared ? { selectedModelId: '' } : {};
    // Close the dialog immediately, then await the PATCH and gate the success-only side effects: a
    // failed remove must not announce success (the store reverted the optimistic change and already
    // announced `settingsSaveFailed`), so neither announce nor move focus on `!ok`.
    setRemoveId(null);
    const ok = await dispatch({ connections: wire, ...clear }, (s) => ({
      ...s,
      connections: s.connections.filter((c) => c.id !== target.id),
      ...clear,
    }));
    if (!ok) {
      // The remove PATCH failed; the store reverted the optimistic removal (the row is back) and
      // announced settingsSaveFailed. Move focus to a still-mounted control - a sibling's Edit button, or
      // the Add button when this was the only row - so focus does not stay on <body> after the dialog's
      // detached opener was skipped.
      focusAfterRemove(target.id);
      return;
    }
    notify({ type: 'connectionRemoved', label: target.label, modelCleared });
    focusAfterRemove(target.id);
  };

  const toggleEnabled = async (connection: RedactedConnection, enabled: boolean): Promise<void> => {
    const updated = { ...redactedToPublic(connection), enabled };
    const wire = buildConnectionsPatch(connections, updated);
    const ok = await dispatch({ connections: wire }, (s) => ({
      ...s,
      connections: s.connections.map((c) => (c.id === connection.id ? { ...c, enabled } : c)),
    }));
    if (ok) notify({ type: 'connectionEnabledChanged', label: connection.label, enabled });
  };

  return { handleSubmit, confirmRemove, toggleEnabled };
}
