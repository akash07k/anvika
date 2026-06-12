import { useEffect, useState } from 'react';

import { FieldShell } from './FieldShell';

/**
 * Decide whether a blurred number-field draft should commit, and to what value. Returns the parsed
 * number to commit, or `null` to skip. This is the locus of the commit-on-blur guard, extracted
 * as a pure function because it has been the source of two review findings and jsdom's number input
 * cannot exercise its edge cases through the DOM (it sanitizes non-representable values to empty):
 *
 * - a blank draft is an in-progress edit, not a commit of `0` (since `Number('') === 0`), so clearing
 *   the field never trips the caller's `min`;
 * - an unchanged draft does not re-commit;
 * - a non-finite parse (`NaN` from non-numeric text, or `Infinity` from an overflow like `'1e999'` /
 *   a 400-digit string) is rejected, so it never commits optimistically or serializes to `null` on the
 *   wire.
 *
 * The unchanged check compares the draft against `format(currentValue)` (not raw `String`), so when the
 * field displays a formatted value (e.g. a rate shown to 3 decimals) a blur with no edit does not
 * spuriously re-commit (which would, for the rate, re-stamp its last-updated time).
 *
 * @param draft - The current string draft from the input.
 * @param currentValue - The committed value the field currently reflects.
 * @param format - How the field renders `currentValue` as a draft string; defaults to `String`.
 * @returns The finite number to commit, or `null` to skip.
 */
export function committableNumber(
  draft: string,
  currentValue: number,
  format: (value: number) => string = String,
): number | null {
  if (draft.trim() === '' || draft === format(currentValue)) return null;
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A labelled number field that commits on BLUR. The draft is kept as a string so intermediate
 * typing (e.g. `2`, `25`, `250` on the way to `2500`) never fires a commit and never trips schema
 * `min`/`max`. The blur handler delegates the commit decision to {@link committableNumber}; the
 * caller's schema does the range validation. An optional `format` controls how the committed value is
 * rendered as a draft (e.g. a fixed-decimals rate); it must be a STABLE reference (a module-level or
 * memoized function) so an in-progress edit is not reset on a parent re-render. Defaults to `String`.
 */
export function NumberField({
  id,
  label,
  description,
  error,
  value,
  onCommit,
  disabled,
  format,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean | undefined;
  format?: ((value: number) => string) | undefined;
}) {
  const toDraft = format ?? String;
  const [draft, setDraft] = useState(toDraft(value));
  useEffect(() => setDraft(toDraft(value)), [value, toDraft]);
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      {({ controlId, labelId, describedBy }) => (
        <input
          id={controlId}
          type="number"
          value={draft}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = committableNumber(draft, value, toDraft);
            if (next !== null) onCommit(next);
          }}
        />
      )}
    </FieldShell>
  );
}
