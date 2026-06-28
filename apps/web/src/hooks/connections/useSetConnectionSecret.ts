import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import { SettingsResponseSchema } from '@anvika/shared/settings/contracts';

import { useSettingsStore } from '../../stores/settingsStore';

import { apiPut } from '../../lib/api-client';
import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from '../conversation/useModels';

/** Arguments to set a connection's secret: the connection id and the secret-patch. */
export interface SetConnectionSecretArgs {
  /** The id of the connection whose secret is written. */
  id: string;
  /** The secret-patch to apply (set with a string, clear with `null`, keep by omission). */
  patch: SetConnectionSecret;
}

/**
 * PUT the secret-patch to `PUT /api/v1/connections/:id/secret` and reconcile the settings store and
 * the models query from the AUTHORITATIVE redacted response. The connections array's `{ isSet }`
 * flags are corrected from that response, and a credential change may alter the available model list,
 * so the models query is invalidated. This does NOT announce - the fieldset orchestrates the
 * partial-failure/success announcement. The whole PUT-and-reconcile runs through the settings store's
 * `serializeWrite`, so it is ordered with the other settings writers: a write that lands between
 * the public connections PATCH and this secret PUT can no longer be clobbered by this reconcile, nor
 * this one by theirs. Exported for unit testing.
 *
 * @param args - The connection id and the secret-patch to write.
 */
export async function runSetSecret({ id, patch }: SetConnectionSecretArgs): Promise<void> {
  await useSettingsStore.getState().serializeWrite(async () => {
    const body = await apiPut(
      `/api/v1/connections/${encodeURIComponent(id)}/secret`,
      patch,
      SettingsResponseSchema,
    );
    if (body) {
      useSettingsStore.setState({
        version: body.version,
        settings: body.settings,
      });
      void queryClient.invalidateQueries({ queryKey: modelsQueryKey });
    }
  });
}

/**
 * A TanStack mutation that writes one connection's secret by id - the only secret-write channel. On
 * success it reconciles the store and the models query from the redacted response (see
 * {@link runSetSecret}); it does not announce. Callers `mutateAsync` it to sequence it after the
 * public connections PATCH and surface a partial-failure announcement when it rejects.
 *
 * @returns The mutation result whose `mutateAsync` writes the secret for a {@link SetConnectionSecretArgs}.
 */
export function useSetConnectionSecret(): UseMutationResult<void, Error, SetConnectionSecretArgs> {
  return useMutation<void, Error, SetConnectionSecretArgs>({ mutationFn: runSetSecret });
}
