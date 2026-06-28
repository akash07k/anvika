import { FieldShell } from './FieldShell';

/** One option in a {@link SelectField}. */
export interface SelectOption {
  /** The stored value. */
  value: string;
  /** The visible option label. */
  label: string;
}

/** A labelled select with explicit options. */
export function SelectField({
  id,
  label,
  description,
  error,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <FieldShell id={id} label={label} description={description} error={error}>
      {({ controlId, labelId, describedBy }) => (
        <select
          id={controlId}
          value={value}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}
