import type { ReactNode } from 'react';

/** Props shared by every field primitive (label/description/error wiring). */
export interface FieldShellProps {
  /** The control's id; the label's `htmlFor` and the description/error ids derive from it. */
  id: string;
  /** The visible field label. */
  label: string;
  /** Optional helper text, associated via `aria-describedby`. */
  description?: string | undefined;
  /**
   * Optional error text. Rendered as NON-live text associated via `aria-describedby` (ADR 0015) -
   * never `role="alert"`. The save failure is announced once through the notification layer; this
   * field text is the durable, navigable detail discoverable on reaching the control.
   */
  error?: string | undefined;
  /**
   * When true, marks the field as required: a visual asterisk is appended to the label for sighted
   * keyboard users. The asterisk is `aria-hidden`, so the screen-reader "required" announcement comes
   * from the control's own `aria-required` (the primitive sets it), avoiding a double announcement.
   */
  required?: boolean | undefined;
  /** Renders the control, given the ids and the computed `aria-describedby`. */
  children: (ids: {
    controlId: string;
    labelId: string;
    describedBy: string | undefined;
  }) => ReactNode;
}

/**
 * The accessibility shell shared by every field primitive: it renders the `<label>` bound to the
 * control by `htmlFor`/`id`, an optional description, and an optional error as NON-live text
 * (ADR 0015 - not `role="alert"`; the notification layer speaks the failure once), and passes the
 * control the computed `aria-describedby` linking both. Getting this right ONCE here is the point of
 * the primitives - each field reuses verified label/description/error wiring.
 *
 * The control additionally takes its accessible name from the label via `aria-labelledby` (the
 * `labelId` passed to {@link FieldShellProps.children}). The native `htmlFor`/`id` link already names
 * the control, but oxlint's `jsx-a11y/control-has-associated-label` does not trace that link, so the
 * explicit `aria-labelledby` is required (same pattern as `Composer.tsx`).
 */
export function FieldShell({ id, label, description, error, required, children }: FieldShellProps) {
  const labelId = `${id}-label`;
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} id={labelId}>
        {label}
      </label>
      {/* The asterisk is a sibling (not inside the label) so the label text and the control's
          accessible name stay exactly the label; the screen-reader "required" cue comes from the
          control's aria-required. The asterisk is aria-hidden, a visual-only cue for sighted users. */}
      {required ? <span aria-hidden="true"> *</span> : null}
      {description ? <p id={descId}>{description}</p> : null}
      {children({ controlId: id, labelId, describedBy })}
      {error ? <p id={errId}>{error}</p> : null}
    </div>
  );
}
