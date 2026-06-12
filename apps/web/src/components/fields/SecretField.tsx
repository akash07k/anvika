import { useState } from 'react';

import { FieldShell } from './FieldShell';

/**
 * A write-only secret field. It has ONE save - the consuming form's "Save connection";
 * this field has no inner Save button. The typed value lives only in local component state and is
 * committed into the form draft on BLUR via `onCommit` (the same commit-on-blur model as
 * {@link TextField}); the form's Save is what persists it. The plaintext is never lifted into the
 * global store, persisted in client state, or displayed.
 *
 * State machine:
 * - No stored key (`isSet` false): a masked input with a Show/Hide toggle, committed on blur. After
 *   commit the input keeps showing the (masked) draft so the user can re-Show it.
 * - Stored key (`isSet` true): a write-only "Set" indicator plus a "Replace {label}" button. Clicking
 *   Replace reveals a fresh empty masked input (with Show/Hide) plus a Cancel button. Cancel returns
 *   to the "Set" state via `onCancelReplace` WITHOUT changing the stored key - the draft is reset to
 *   "keep stored", so a subsequent form Save neither clears nor changes the key.
 *
 * Write-only is preserved: a stored key is never displayed (only Set/Replace); the Show toggle only
 * ever reveals the key the user is CURRENTLY typing, never a stored one.
 *
 * In the set state the status text is associated with the field label via `aria-labelledby`. The
 * Replace, Show/Hide, and Cancel buttons each carry an `aria-label` that includes the field `label`,
 * so a screen-reader user navigating by buttons across several providers hears e.g. "Replace
 * Anthropic API key" rather than a bare, ambiguous "Replace". There is no per-field announcement on
 * commit - capture is silent, like every other commit-on-blur field; the form's Save announces.
 */
export function SecretField({
  id,
  label,
  description,
  error,
  isSet,
  onCommit,
  onCancelReplace,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  /** Optional error text, rendered as non-live `aria-describedby` text (ADR 0015 - not an alert). */
  error?: string | undefined;
  /** Whether a key is already stored; when true the field shows Set/Replace instead of an input. */
  isSet: boolean;
  /** Commit the typed value into the form draft on blur (commit-on-blur, matching {@link TextField}). */
  onCommit: (value: string) => void;
  /**
   * Reset the draft back to "keep stored" when the user cancels a Replace (only reachable when a key
   * is stored). The consumer clears any staged key so the stored key is kept and Save does not change
   * it. Omit in add mode, where Cancel is never shown.
   */
  onCancelReplace?: (() => void) | undefined;
}) {
  const [editing, setEditing] = useState(!isSet);
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);

  if (isSet && !editing) {
    return (
      <FieldShell id={id} label={label} description={description} error={error}>
        {({ labelId, describedBy }) => (
          <span>
            <span aria-labelledby={labelId} aria-describedby={describedBy}>
              Set
            </span>
            <button type="button" aria-label={`Replace ${label}`} onClick={() => setEditing(true)}>
              Replace
            </button>
          </span>
        )}
      </FieldShell>
    );
  }

  const cancel = () => {
    setValue('');
    setRevealed(false); // a fresh entry always starts hidden (the secure default)
    setEditing(false);
    onCancelReplace?.();
  };

  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      {({ controlId, labelId, describedBy }) => (
        <span>
          <input
            id={controlId}
            type={revealed ? 'text' : 'password'}
            value={value}
            aria-labelledby={labelId}
            aria-describedby={describedBy}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              // Commit only a real entry; an empty OR all-whitespace blur (tabbing through, backing
              // out, or stray spaces) leaves the draft untouched so a stored key is kept and add mode
              // stays keyless - never persist a whitespace-only key. The committed value itself is not
              // trimmed (a real key has no surrounding space; preserve exactly what was typed).
              if (value.trim().length > 0) onCommit(value);
            }}
          />
          <button
            type="button"
            aria-pressed={revealed}
            aria-label={`${revealed ? 'Hide' : 'Show'} ${label}`}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
          {isSet ? (
            <button type="button" aria-label={`Keep current ${label}`} onClick={cancel}>
              Cancel
            </button>
          ) : null}
        </span>
      )}
    </FieldShell>
  );
}
