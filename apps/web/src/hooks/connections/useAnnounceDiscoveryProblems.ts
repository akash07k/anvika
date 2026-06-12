import { useEffect, useRef } from 'react';

import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';

import { isLoadProblem } from '../../components/connections/discoveryStatusMessage';
import { notify } from '../../notifications/notifier';

/** The minimal connection shape the hook needs to resolve a content-safe label. */
interface LabelledConnection {
  id: string;
  label: string;
}

/**
 * Announce a discovery problem ONCE when it newly appears, naming the affected
 * connections by their content-safe label. Deduped against the last-announced problem set so a
 * background refetch with the same problems stays silent; fires on first load because the prior set
 * was empty. Passive surfaces (the row line, the picker pointer) carry the always-present detail.
 *
 * Dedup semantics: announce when the problem-id set gains a NEW connection id that was not in the
 * last-announced set. A refetch yielding the same ids stays silent. On first load `lastRef` is
 * empty, so any problem is "new" and announces. The label fallback to the connection id keeps it
 * content-safe if a label is missing.
 *
 * @param statuses - The current per-connection discovery statuses, or `undefined` before the load.
 * @param connections - The connections, used to resolve each problem id to a content-safe label.
 */
export function useAnnounceDiscoveryProblems(
  statuses: ConnectionDiscoveryStatus[] | undefined,
  connections: readonly LabelledConnection[],
): void {
  const lastRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const problems = (statuses ?? []).filter((s) => isLoadProblem(s.outcome));
    const ids = new Set(problems.map((s) => s.connectionId));
    const hasNew = [...ids].some((id) => !lastRef.current.has(id));
    lastRef.current = ids;
    if (problems.length > 0 && hasNew) {
      const labels = problems.map(
        (s) => connections.find((c) => c.id === s.connectionId)?.label ?? s.connectionId,
      );
      notify({ type: 'modelDiscoveryProblem', labels });
    }
  }, [statuses, connections]);
}
