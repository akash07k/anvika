import { useState } from 'react';

import { ModelsResponseSchema } from '@anvika/shared/models/contracts';

import { isLoadProblem } from '../../components/connections/discoveryStatusMessage';
import { notify } from '../../notifications/notifier';
import { apiPost } from '../../lib/api-client';
import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from './useModels';

/** The minimal connection shape the hook needs to resolve a content-safe problem label. */
interface LabelledConnection {
  id: string;
  label: string;
}

/**
 * Manually refresh the model list: POST `/api/v1/models/refresh` (which busts the
 * models.dev catalog server-side), reconcile the query cache with the fresh envelope, and announce the
 * lifecycle - started, then ok with the available count and the content-safe labels of any connection
 * whose listing could not be loaded, or the uniform failure (the existing list is unchanged). The POST
 * throws on any non-success response, so the catch is the single failure path; the refresh outcome is
 * logged server-side in the route, so this announces only.
 *
 * @param connections - The connections, used to resolve each problem id to a content-safe label.
 * @returns The `busy` flag (true while a refresh is in flight) and the `refresh` action.
 */
export function useRefreshModels(connections: readonly LabelledConnection[]): {
  busy: boolean;
  refresh: () => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const refresh = async (): Promise<void> => {
    setBusy(true);
    notify({ type: 'modelsRefreshStarted' });
    try {
      const body = await apiPost('/api/v1/models/refresh', {}, ModelsResponseSchema);
      if (!body) {
        // The route always returns the envelope on success, so a missing body (a 204) means nothing
        // was refreshed; treat it the same as a failure - the existing list stays as it was.
        notify({ type: 'modelsRefreshFailed' });
        return;
      }
      queryClient.setQueryData(modelsQueryKey, body);
      const problemLabels = body.connectionStatuses
        .filter((s) => isLoadProblem(s.outcome))
        .map((s) => connections.find((c) => c.id === s.connectionId)?.label ?? s.connectionId);
      notify({ type: 'modelsRefreshOk', count: body.models.length, problemLabels });
    } catch {
      notify({ type: 'modelsRefreshFailed' });
    } finally {
      setBusy(false);
    }
  };
  return { busy, refresh };
}
