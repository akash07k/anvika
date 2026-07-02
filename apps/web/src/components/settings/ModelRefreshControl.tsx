import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { useRefreshModels } from '../../hooks/conversation/useRefreshModels';
import { RemoteRefreshButton } from './RemoteRefreshButton';

/**
 * The "Refresh models" control in the Settings Model section: a {@link RemoteRefreshButton}
 * that re-fetches the model list and busts the enrichment cache via {@link useRefreshModels}. The
 * hook owns the request and the screen-reader announcements; the busy state disables the button
 * while in flight.
 *
 * @param props.connections - The connections, so a refresh problem can be named by label.
 * @returns The refresh button.
 */
export function ModelRefreshControl({
  connections,
}: {
  connections: RedactedSettings['connections'];
}) {
  const { busy, refresh } = useRefreshModels(connections);
  return <RemoteRefreshButton label="Refresh models" busy={busy} onPress={() => void refresh()} />;
}
