import { useEffect, useId, useRef, useState } from 'react';

import {
  type ConnectionType,
  type PublicConnection,
  CONNECTION_TYPES,
} from '@anvika/shared/settings/connection';
import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import { deriveConnectionId } from '@anvika/shared/settings/connection-id';
import type { RedactedConnection } from '@anvika/shared/settings/redact';

import { CONNECTION_TYPE_DESCRIPTORS } from './connectionTypes';
import { useOwnerAbortSignal } from '../../hooks/chat/useOwnerAbortSignal';
import { useTestConnection } from '../../hooks/connections/useTestConnection';
import { notify } from '../../notifications/notifier';
import { SelectField, type SelectOption } from '../fields/SelectField';
import { TextField } from '../fields/TextField';
import {
  type ConnectionDraft,
  assemblePublicConnection,
  assembleSecretPatch,
  draftFromExisting,
  emptyDraft,
} from './connectionDraft';
import { ConnectionFields } from './ConnectionFields';
import { draftValidationError } from './draftValidationError';
import { LastTestStatus } from './LastTestStatus';
import { testRequestFor } from './testRequest';

/** The static list of type options for the add-mode "Type" select, by descriptor label. */
const TYPE_OPTIONS: SelectOption[] = CONNECTION_TYPES.map((type) => ({
  value: type,
  label: CONNECTION_TYPE_DESCRIPTORS[type].label,
}));

/**
 * The accessible add/edit form for one provider connection. It is data-driven by
 * `CONNECTION_TYPE_DESCRIPTORS`: selecting a type re-renders that type's fields. On mount it moves
 * focus to its `<h3>` heading so a screen-reader user is oriented before the fields. Focus
 * restoration to the opener/list is the PARENT's responsibility, not this form's.
 *
 * The form is a labelled `region` landmark: a native `<section>` named by its heading via
 * `aria-labelledby`, so a screen-reader user navigating by landmark (NVDA D key) hears entering and
 * leaving "Add connection" or "Edit <label>" and always knows whether they are inside the inline
 * add/edit region or back in the connections list.
 *
 * Add mode auto-derives the connection id from the label until the user edits the id. Edit mode shows
 * the type and id as static read-only text (never dimmed controls) and pre-fills non-secret fields;
 * the API key shows "Set" until re-typed. The in-form Test button tests the assembled draft (add, or
 * edit with a re-typed key) or the saved connection by id (edit with a clean key); its result is
 * mirrored in a persistent {@link LastTestStatus} line the user can re-read. A test still in flight
 * when the form unmounts is cancelled and its late announcement silenced via an owner-lifetime signal.
 */
export function ConnectionForm({
  mode,
  existing,
  existingIds,
  onSubmit,
  onCancel,
}: {
  mode: 'add' | 'edit';
  existing?: RedactedConnection | undefined;
  existingIds: string[];
  onSubmit: (result: { connection: PublicConnection; secret: SetConnectionSecret | null }) => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<ConnectionDraft>(() =>
    mode === 'edit' && existing ? draftFromExisting(existing) : emptyDraft(CONNECTION_TYPES[0]),
  );
  // A content-safe validation summary from the last rejected Save, rendered as non-live text (ADR 0015)
  // and also announced once. `null` while the draft is valid or has not been submitted.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Guard the Save button against a double-click firing the save twice. The ref blocks a same-tick
  // second click (both click closures would otherwise read the stale state); the state drives
  // aria-disabled. No reset is needed: the form unmounts after any submit attempt (the parent calls
  // setForm(null) on both success and failure).
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const test = useTestConnection(useOwnerAbortSignal()); // signal aborts on unmount; silences late test

  // Orient the screen-reader user on the form before the fields (focus the heading once on mount).
  useEffect(() => headingRef.current?.focus(), []);

  const patch = (next: Partial<ConnectionDraft>): void => {
    setDraft((prev) => {
      const merged = { ...prev, ...next };
      // Auto-derive the id from the label until the user edits the id manually.
      const labelChanged = next.label !== undefined && next.label !== prev.label;
      if (mode === 'add' && !merged.idEdited && labelChanged) {
        merged.id = deriveConnectionId(merged.label, merged.type, existingIds);
      }
      return merged;
    });
  };

  // Switching type clears fields that do not exist on every type, so a stale Azure resource name or a
  // leftover header row from a prior type can never leak into the assembled connection.
  const changeType = (value: string): void =>
    patch({ type: value as ConnectionType, resourceName: '', apiVersion: '', headers: [] });

  const isSetApiKey = existing?.apiKey?.isSet ?? false;
  const descriptor = CONNECTION_TYPE_DESCRIPTORS[draft.type];
  const headingText = mode === 'add' ? 'Add connection' : `Edit ${existing?.label ?? ''}`.trim();

  const submit = (): void => {
    // On invalid drafts a screen-reader user needs feedback, not a silent no-op: announce a
    // content-safe summary once and render the same text inline (non-live, ADR 0015).
    const error = draftValidationError(draft);
    if (error !== null) {
      setSaveError(error);
      notify({ type: 'settingsSaveFailed', message: error });
      return;
    }
    setSaveError(null);
    submittingRef.current = true;
    setSubmitting(true);
    onSubmit({
      connection: assemblePublicConnection(draft, existing),
      secret: assembleSecretPatch(draft, existing),
    });
  };

  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} ref={headingRef} tabIndex={-1}>
        {headingText}
      </h3>

      {mode === 'add' ? (
        <SelectField
          id="connection-type"
          label="Type"
          value={draft.type}
          options={TYPE_OPTIONS}
          onChange={changeType}
        />
      ) : (
        <p>{`Type: ${descriptor.label}`}</p>
      )}

      <ConnectionFields
        fields={descriptor.fields}
        draft={draft}
        isSetApiKey={isSetApiKey}
        patch={patch}
      />

      {mode === 'add' ? (
        <TextField
          id="connection-id"
          label="Connection id"
          value={draft.id}
          onCommit={(value) => patch({ id: value, idEdited: true })}
        />
      ) : (
        <p>{`Connection id: ${draft.id}`}</p>
      )}

      <button
        type="button"
        aria-disabled={test.isPending}
        onClick={() => {
          if (!test.isPending) test.mutate(testRequestFor(draft, mode, existing));
        }}
      >
        {test.isPending ? 'Testing...' : 'Test connection'}
      </button>
      {/* A persistent, non-live record of the last test outcome so a screen-reader user can re-read
          it; the one-shot announcement is spoken once via the notification layer (see ConnectionListItem). */}
      <LastTestStatus outcome={test.data} />
      <button
        type="button"
        aria-disabled={submitting}
        aria-describedby={saveError ? 'connection-save-error' : undefined}
        onClick={() => {
          if (!submittingRef.current) submit();
        }}
      >
        {submitting ? 'Saving...' : 'Save connection'}
      </button>
      {saveError ? <p id="connection-save-error">{saveError}</p> : null}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}
