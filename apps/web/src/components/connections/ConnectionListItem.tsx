import { useId, type Ref } from 'react';

import type { RedactedConnection } from '@anvika/shared/settings/redact';

import { CONNECTION_TYPE_DESCRIPTORS } from './connectionTypes';
import { useConnectionStatuses } from '../../hooks/conversation/useModels';
import { useTestConnection } from '../../hooks/connections/useTestConnection';
import { ToggleField } from '../fields/ToggleField';

import { discoveryStatusMessage } from './discoveryStatusMessage';
import { LastTestStatus } from './LastTestStatus';

/** Props for {@link ConnectionListItem}. */
export interface ConnectionListItemProps {
  /** The redacted connection this row renders. */
  connection: RedactedConnection;
  /** Invoked when the user activates Edit for this connection. */
  onEdit: () => void;
  /** Invoked when the user activates Remove for this connection (opens the confirm dialog). */
  onRemove: () => void;
  /** Mute or unmute this connection. */
  onToggleEnabled: (enabled: boolean) => void;
  /** A ref placed on the row's `<h3>` so the parent can move focus here after a save. */
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  /** A ref placed on the Edit button so the parent can restore focus after removing a sibling. */
  editButtonRef?: Ref<HTMLButtonElement> | undefined;
}

/**
 * One connection row: an `<h3>` carrying the connection label, static "Type" and key-indicator text,
 * Edit/Remove/Test controls, and a persistent {@link LastTestStatus} line. It holds its OWN
 * {@link useTestConnection} so a test (and its "Last test" record) is scoped to this connection.
 *
 * Accessible names are composed from VISIBLE text via `aria-labelledby` (never a hand-authored
 * `aria-label`): each action button references its own visible-text id plus the heading id, so AT
 * announces "Edit Venice" / "Remove Venice" / "Test Venice" while the visible label stays the short
 * verb. The Test button uses `aria-disabled` (not `disabled`) while pending so it stays focusable and
 * its busy state ("Testing...") is still reachable and announced. The key indicator is a Set/not-set
 * flag (never the secret value). The discovery status line shows the base URL only in the
 * local-unreachable case - this is the owner's own configured URL on their own screen and is never
 * logged (see {@link discoveryStatusMessage}).
 */
export function ConnectionListItem({
  connection,
  onEdit,
  onRemove,
  onToggleEnabled,
  headingRef,
  editButtonRef,
}: ConnectionListItemProps) {
  const headingId = useId();
  const editTextId = useId();
  const removeTextId = useId();
  const testTextId = useId();
  const test = useTestConnection();

  const { data: statuses } = useConnectionStatuses();
  const outcome = statuses?.find((s) => s.connectionId === connection.id)?.outcome;
  const baseUrl = connection.type === 'openai-compatible' ? connection.baseUrl : undefined;
  const statusLine = outcome
    ? discoveryStatusMessage(connection.type, outcome, connection.label, baseUrl)
    : null;

  const typeLabel = CONNECTION_TYPE_DESCRIPTORS[connection.type].label;
  const keyIndicator = connection.apiKey?.isSet ? 'API key: Set' : 'API key: not set';

  return (
    <div>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {connection.label}
      </h3>
      <p>{`Type: ${typeLabel}`}</p>
      <p>{keyIndicator}</p>

      {/* Compose the checkbox name as "Active <connection>" (via the heading id) so a list of rows
          does not announce an ambiguous bare "Active" for every connection (mirrors the buttons). */}
      <ToggleField
        id={`${headingId}-enabled`}
        label="Active"
        labelledByExtraId={headingId}
        checked={connection.enabled}
        onChange={onToggleEnabled}
      />
      {connection.enabled ? null : <p>Deactivated. Excluded from the model list.</p>}

      <button
        type="button"
        ref={editButtonRef}
        aria-labelledby={`${editTextId} ${headingId}`}
        onClick={onEdit}
      >
        <span id={editTextId}>Edit</span>
      </button>
      <button type="button" aria-labelledby={`${removeTextId} ${headingId}`} onClick={onRemove}>
        <span id={removeTextId}>Remove</span>
      </button>
      <button
        type="button"
        aria-labelledby={`${testTextId} ${headingId}`}
        aria-disabled={test.isPending}
        onClick={() => {
          if (!test.isPending) test.mutate({ connectionId: connection.id });
        }}
      >
        <span id={testTextId}>{test.isPending ? 'Testing...' : 'Test'}</span>
      </button>

      <LastTestStatus outcome={test.data} />
      {statusLine ? <p>{statusLine}</p> : null}
    </div>
  );
}
