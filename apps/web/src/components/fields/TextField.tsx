import { useEffect, useState } from 'react';

import { FieldShell } from './FieldShell';

/**
 * A labelled single-line text field that commits on BLUR, not per keystroke. It holds a local
 * draft so typing has no side effects; on blur it commits the draft via `onCommit` only if it changed.
 * The draft re-syncs when `value` changes (e.g. the store reconciles from the server response).
 *
 * `onChange` is an OPTIONAL live callback: callers that must read the latest value WITHOUT waiting for
 * a blur (e.g. a dialog whose Create button reads the field) pass it to receive every keystroke. It
 * does not replace the blur commit; omit it to keep the commit-on-blur-only behavior.
 */
export function TextField({
  id,
  label,
  description,
  error,
  value,
  onCommit,
  onChange,
  required,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  value: string;
  onCommit: (value: string) => void;
  onChange?: ((value: string) => void) | undefined;
  required?: boolean | undefined;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <FieldShell id={id} label={label} description={description} error={error} required={required}>
      {({ controlId, labelId, describedBy }) => (
        <input
          id={controlId}
          type="text"
          value={draft}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange?.(e.target.value);
          }}
          onBlur={() => {
            if (draft !== value) onCommit(draft);
          }}
        />
      )}
    </FieldShell>
  );
}
