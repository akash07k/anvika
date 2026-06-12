/** Shared type contracts for the connection mutations hook. */

import type { Dispatch, SetStateAction } from 'react';

import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { RedactedConnection, RedactedSettings } from '@anvika/shared/settings/redact';

/**
 * The patch dispatcher shared with the settings form: a wire patch plus an optimistic updater. It
 * resolves `true` on a successful commit and `false` on any non-success path, so the caller can
 * await it to decide whether to proceed to the secret PUT (or, for a remove, whether to announce).
 */
export type PatchFn = (
  wirePatch: Record<string, unknown>,
  optimistic: (settings: RedactedSettings) => RedactedSettings,
  options?: { announce?: boolean; skipModelsInvalidation?: boolean; pendingSecretLabel?: string },
) => Promise<boolean>;

/** Which inline form, if any, is open. */
export type FormState = { mode: 'add' } | { mode: 'edit'; id: string } | null;

/** The inputs the mutation hook needs from the owning fieldset (focus state stays in the component). */
export interface UseConnectionMutationsInput {
  /** The current redacted connections list (the public, secret-free projection). */
  connections: RedactedConnection[];
  /** The full redacted settings, for the selected-model-clear decision on remove. */
  settings: RedactedSettings;
  /** The shared settings dispatcher (public PATCH plus optimistic projection). */
  onPatch: PatchFn;
  /** Close the inline form (set the form state to `null`). */
  setForm: Dispatch<SetStateAction<FormState>>;
  /** Arm the post-save focus move to the saved row's heading. */
  setFocusSavedId: Dispatch<SetStateAction<string | null>>;
  /**
   * Arm the post-close focus move to the form's opener: `null` = the Add button, otherwise that
   * connection's Edit button. Used on a FAILED public PATCH so focus does not fall to `<body>` when
   * the Save button unmounts; the owning component's deferred effect focuses the target once
   * it is re-mounted. `undefined` means "do not arm" (the effect no-ops).
   */
  setFocusOpenerId: Dispatch<SetStateAction<string | null | undefined>>;
  /** Move focus to the appropriate sibling (or Add button) after a confirmed remove. */
  focusAfterRemove: (removedId: string) => void;
  /** Close the destructive-remove confirmation dialog. */
  setRemoveId: Dispatch<SetStateAction<string | null>>;
}

/** The save, remove, and enable-toggle orchestrators returned to the owning fieldset. */
export interface ConnectionMutations {
  /**
   * Save a connection as a TWO-call sequence: the PUBLIC connections PATCH (no secrets) first, then -
   * only when a secret changed and the public PATCH succeeded - a secret PUT. A failed public PATCH
   * skips the secret PUT (the store already announced or armed the overwrite prompt); a public success
   * with a failed secret PUT announces `connectionSaveFailed` so the user knows to re-edit.
   */
  handleSubmit: (input: {
    connection: PublicConnection;
    secret: SetConnectionSecret | null;
  }) => Promise<void>;
  /**
   * Confirm a destructive remove: dispatch the full-array PATCH (clearing the selected model when it
   * belonged to this connection), then - only when the PATCH succeeds - announce `connectionRemoved`
   * and move focus. A failed remove neither announces nor refocuses (the store reverted and announced
   * `settingsSaveFailed`).
   */
  confirmRemove: (target: RedactedConnection) => Promise<void>;
  /**
   * Mute or unmute a connection: PATCH only its `enabled` flag (the selected model is left
   * untouched - GA), then announce the change on success.
   */
  toggleEnabled: (connection: RedactedConnection, enabled: boolean) => Promise<void>;
}
