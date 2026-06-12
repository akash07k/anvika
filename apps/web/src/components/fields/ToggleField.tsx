import { FieldShell } from './FieldShell';

/**
 * A labelled boolean checkbox. When `labelledByExtraId` is given, the checkbox's accessible name is
 * composed from its own label PLUS that element (for example a list-row heading), so repeated toggles
 * in a list announce a unique name like "Active Venice" rather than an ambiguous bare "Active". This
 * mirrors the verb-plus-heading naming the connection row already uses for its Edit/Remove/Test
 * buttons (composed visible text via `aria-labelledby`, never a hand-authored `aria-label`).
 */
export function ToggleField({
  id,
  label,
  description,
  error,
  checked,
  onChange,
  labelledByExtraId,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Optional id appended to the checkbox `aria-labelledby` so its name reads "label plus that text". */
  labelledByExtraId?: string | undefined;
}) {
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      {({ controlId, labelId, describedBy }) => (
        <input
          id={controlId}
          type="checkbox"
          checked={checked}
          aria-labelledby={labelledByExtraId ? `${labelId} ${labelledByExtraId}` : labelId}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}
    </FieldShell>
  );
}
