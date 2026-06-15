# The add/edit connection form is inline disclosure with explicit focus choreography, not a modal

Status: Accepted.

The add/edit connection form is revealed INLINE inside the Connections fieldset, one at a time,
rather than in a modal dialog. The fieldset owns an explicit focus choreography for open, cancel,
save, and a destructive remove, so a screen-reader and keyboard user is always oriented and never
loses focus to `<body>`. The immutable `type` and `id` render as static read-only text on edit, and a
destructive remove reuses the existing accessible `alertdialog` confirmation.

## Context

A connection has type-dependent fields, a write-only key, and (for `openai-compatible`) a header
editor, so the add/edit surface is non-trivial. Anvika targets screen-reader and keyboard users
(`ARCHITECTURE.md`), so the surface's accessibility - where focus lands on
each transition, and whether the user is pulled into a focus-trap context switch - matters more than
its visual treatment. shadcn/Radix is not yet vendored in `apps/web`, so a built-in disclosure is the
zero-dependency option (consistent with ADR 0019's native-dialog choice).

## Decision

The form is rendered inline within the Connections `<fieldset>`
(`apps/web/src/components/connections/ConnectionsFieldset.tsx` plus `ConnectionForm.tsx`), replacing
the row being edited or appearing after the list for an add. Only one form is open at a time.

Focus choreography (owned by the fieldset, except the on-open move which the form does):

- On OPEN, the form moves focus to its `<h3>` heading, so the user is oriented on the form before
  the fields.
- CANCEL restores focus to the control that opened the form - the connection's Edit button for an
  edit, or the Add button for an add.
- A SAVE moves focus to the saved row's `<h3>` heading (held until the new row is actually in the
  DOM, so a render before the row arrives simply retries).
- A destructive REMOVE moves focus to the NEXT row's Edit button, then the PREVIOUS row's if there is
  no next, and the Add button when the list empties.

The connection `type` and `id` are IMMUTABLE on edit and render as static read-only TEXT (for example
"Type: OpenAI", "Connection id: venice"), never as disabled controls - a disabled control is an
announced-but-dead tab stop, whereas static text reads cleanly and is skipped by control navigation.
In add mode the `type` is a real select and the `id` is a text field that auto-derives from the label
until the user edits it.

A destructive remove reuses the existing accessible `alertdialog` `ConfirmDialog`
(`apps/web/src/components/ConfirmDialog.tsx`) rather than a bespoke inline confirm. Its description
names the consequence ("Remove {label}? This deletes its saved key.") and, when the selected model
belongs to the connection being removed, additionally names the selected-model clear.

## Considered Options

- **A modal dialog for add/edit:** rejected. A modal traps focus and switches the user into a
  separate context, which for a screen-reader user is a heavier interruption than revealing fields in
  place; it would also need shadcn/Radix (not yet vendored) or a hand-built focus trap. Inline
  disclosure keeps the user in one document flow.
- **Disabled controls for the immutable type/id on edit:** rejected. A disabled field is still a tab
  stop a screen reader announces, implying an editability that is not there; static read-only text
  conveys the value without the dead control.
- **A bespoke inline two-step confirm for remove:** rejected in favor of reusing `ConfirmDialog`, the
  already-audited `alertdialog` confirmation, so the destructive-action affordance is consistent and
  its accessibility safeguards (initial focus on Cancel, consequence in the description, focus
  restore) are not re-implemented.

## Consequences

- Add, edit, cancel, save, and remove each have a defined focus destination, so focus never silently
  drops to `<body>` and the user always knows where they are.
- The immutable `type`/`id` are unambiguous on edit (plain text, not a confusing disabled control),
  and the destructive remove's consequence - including the selected-model clear when it applies - is
  spoken before the user can confirm.
- Trade-off: inline disclosure keeps the screen-reader user in one continuous document flow rather
  than a modal's focus-trapped context switch; the cost is that the form shares the page's scroll and
  tab order rather than being isolated, which the explicit focus moves manage.
- The rich, filterable model picker and any heavier connection UI are a later step; this is the
  current settings surface.
