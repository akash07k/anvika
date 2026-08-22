import { useEffect, useRef, useState } from 'react';

import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { ConfirmDialog } from '../ConfirmDialog';

import { ConnectionForm } from './ConnectionForm';
import { ConnectionListItem } from './ConnectionListItem';
import { modelBelongsToConnection } from './connectionsWire';
import type { FormState, PatchFn } from './connectionMutations.types';
import { useConnectionMutations } from './useConnectionMutations';

/** The section heading text, carrying a live count so a screen-reader user hears how many connections
 *  exist without counting the rows; singular "Connection (1)" reads naturally for a single entry. */
function connectionsHeading(count: number): string {
  return count === 1 ? 'Connection (1)' : `Connections (${count})`;
}

/** Build the destructive-remove confirmation description, naming the model-clear only when it applies. */
function removeDescription(label: string, modelCleared: boolean): string {
  const base = `Remove ${label}? This deletes its saved key.`;
  return modelCleared
    ? `${base} and clears your selected model, which uses this connection.`
    : base;
}

type FocusRequest = { kind: 'saved'; id: string } | { kind: 'opener'; id: string | null };

/**
 * The accessible connections section: a native `<fieldset>` whose `<legend>` carries an `<h2>`
 * "Connections", listing each {@link RedactedConnection} as a {@link ConnectionListItem}. It owns the
 * CRUD choreography - revealing the {@link ConnectionForm} inline (one at a time) for add/edit, and
 * confirming a destructive remove through {@link ConfirmDialog}. The mutation orchestration (the
 * secret-safe two-call save and the gated remove) lives in {@link useConnectionMutations}; this
 * component keeps the FOCUS restoration: Cancel returns focus to the control that opened the form, a
 * save moves focus to the saved row's heading, and a remove moves focus to the next (then previous)
 * row's Edit button, or the Add button when empty.
 */
export function ConnectionsFieldset({
  settings,
  onPatch,
}: {
  settings: RedactedSettings;
  onPatch: PatchFn;
}) {
  const connections = settings.connections;
  const [form, setForm] = useState<FormState>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const addButtonRef = useRef<HTMLButtonElement>(null);
  const editButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const headingRefs = useRef<Map<string, HTMLHeadingElement>>(new Map());
  const focusRequestRef = useRef<FocusRequest | null>(null);
  // A new request object triggers the next committed render; the ref is cleared after focus without
  // scheduling another render, and a missing saved heading remains queued for a later commit.
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);

  // Focus only after the target is mounted. A missing saved heading is retried after each later commit.
  useEffect(() => {
    if (focusRequest === null) return;
    const request = focusRequestRef.current;
    if (request === null) return;
    if (request.kind === 'saved') {
      const heading = headingRefs.current.get(request.id);
      if (heading) {
        heading.focus();
        focusRequestRef.current = null;
      }
      return;
    }
    if (request.id === null) addButtonRef.current?.focus();
    else editButtonRefs.current.get(request.id)?.focus();
    focusRequestRef.current = null;
  });

  const queueFocusRequest = (request: FocusRequest): void => {
    focusRequestRef.current = request;
    setFocusRequest(request);
  };

  const existingIds = connections.map((c) => c.id);
  const pendingRemove = removeId === null ? null : connections.find((c) => c.id === removeId);

  const closeFormToOpener = (openerId: string | null): void => {
    setForm(null);
    queueFocusRequest({ kind: 'opener', id: openerId });
  };

  const focusAfterRemove = (removedId: string): void => {
    const index = connections.findIndex((c) => c.id === removedId);
    const next = connections[index + 1] ?? connections[index - 1];
    if (next) editButtonRefs.current.get(next.id)?.focus();
    else addButtonRef.current?.focus();
  };

  const { handleSubmit, confirmRemove, toggleEnabled } = useConnectionMutations({
    connections,
    settings,
    onPatch,
    setForm,
    requestSavedFocus: (id) => queueFocusRequest({ kind: 'saved', id }),
    requestOpenerFocus: (id) => queueFocusRequest({ kind: 'opener', id }),
    focusAfterRemove,
    setRemoveId,
  });

  return (
    <fieldset>
      <legend>
        <h2>{connectionsHeading(connections.length)}</h2>
      </legend>

      {/* Add control sits directly under the heading, BEFORE the list, so a screen-reader or keyboard
          user reaches it without traversing every existing connection first. */}
      {form?.mode === 'add' ? (
        <ConnectionForm
          mode="add"
          existingIds={existingIds}
          onSubmit={handleSubmit}
          onCancel={() => closeFormToOpener(null)}
        />
      ) : (
        <button type="button" ref={addButtonRef} onClick={() => setForm({ mode: 'add' })}>
          Add connection
        </button>
      )}

      {connections.map((connection) =>
        form?.mode === 'edit' && form.id === connection.id ? (
          <ConnectionForm
            key={connection.id}
            mode="edit"
            existing={connection}
            existingIds={existingIds}
            onSubmit={handleSubmit}
            onCancel={() => closeFormToOpener(connection.id)}
          />
        ) : (
          <ConnectionListItem
            key={connection.id}
            connection={connection}
            onEdit={() => setForm({ mode: 'edit', id: connection.id })}
            onRemove={() => setRemoveId(connection.id)}
            onToggleEnabled={(enabled) => void toggleEnabled(connection, enabled)}
            headingRef={(el) => {
              if (el) headingRefs.current.set(connection.id, el);
              else headingRefs.current.delete(connection.id);
            }}
            editButtonRef={(el) => {
              if (el) editButtonRefs.current.set(connection.id, el);
              else editButtonRefs.current.delete(connection.id);
            }}
          />
        ),
      )}

      <ConfirmDialog
        open={pendingRemove !== null && pendingRemove !== undefined}
        title="Remove connection?"
        description={
          pendingRemove
            ? removeDescription(
                pendingRemove.label,
                modelBelongsToConnection(settings.selectedModelId, pendingRemove.id),
              )
            : ''
        }
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (pendingRemove) void confirmRemove(pendingRemove);
        }}
        onCancel={() => setRemoveId(null)}
      />
    </fieldset>
  );
}
