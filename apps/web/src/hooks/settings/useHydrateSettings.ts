import { useEffect } from 'react';

import { useSettingsStore } from '../../stores/settingsStore';

/**
 * Kick off the one-time settings hydration when the store is still idle. Safe to call from any surface
 * that reads settings: it triggers the fetch only on the first idle mount and no-ops thereafter.
 */
export function useHydrateSettings(): void {
  const settingsStatus = useSettingsStore((s) => s.status);
  const hydrate = useSettingsStore((s) => s.hydrate);
  useEffect(() => {
    if (settingsStatus === 'idle') void hydrate();
    return undefined;
  }, [settingsStatus, hydrate]);
}
