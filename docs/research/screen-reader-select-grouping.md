# Screen readers and native `<select>` `<optgroup>` labels

Research findings for how NVDA, JAWS, and VoiceOver announce the GROUP label of a native
`<select>`'s `<optgroup>`, and the mitigation Anvika adopted for its Settings model picker
(ADR 0026). Research only; the decision and its rationale live in ADR 0026.

## The question

A native `<select>` can group its `<option>`s under `<optgroup label="...">`. Anvika's model
picker groups models by connection, so the natural encoding is one `<optgroup>` per connection with
its label as the group name. The question is whether a screen-reader user reliably HEARS that group
label while choosing a model - because if they do not, the grouping (which connection a model
belongs to) is lost.

## What the screen readers do

The short answer: `<optgroup>` label announcement is INCONSISTENT across screen readers, browsers,
and the mode of interaction (opening the list vs. arrowing through collapsed options), and it is
frequently OMITTED on per-option navigation.

- The group label, when announced at all, is typically spoken once when focus ENTERS a new group,
  not repeated on every option. A user who arrows past the first option of a group, or who lands
  mid-list on a pre-selected value, can therefore never hear the group name for the option they are
  actually on.
- Announcement depends on the combination of screen reader, browser, and platform (and the native
  vs. custom rendering of the collapsed control), so behavior that works in one pairing cannot be
  assumed in another. NVDA/Chrome, NVDA/Firefox, JAWS, and VoiceOver/Safari do not agree.
- `<optgroup>` is also strictly a single, non-nestable level and is non-interactive, so it cannot be
  relied on to carry meaning the way a visible, per-option qualifier can.

The practical consequence for a picker whose grouping is load-bearing (the connection is information
the user needs, not decoration): the group label cannot be the SOLE carrier of the connection.

## The mitigation Anvika adopted

Do not rely on the `<optgroup>` label alone. Bake the group (the connection) into each OPTION's
accessible name, so the grouping is conveyed on every option regardless of optgroup support.

In Anvika's Settings model picker (ADR 0026), the "All" view keeps the per-connection `<optgroup>`
(it helps where it is supported and is correct semantics) but ALSO renders each option's text as
`"displayName (connectionLabel)"`, for example "model (Venice)". Because a native `<option>`'s
accessible name is its text content, every option then announces its connection no matter where the
user lands or which reader they use. Under a specific-connection filter the connection is already
chosen, so the bare display name suffices and no qualifier is added.

This is the same principle as not relying on color or position alone: put the information the user
needs into the accessible name of the thing they navigate to, rather than into an adjacent element
whose announcement is conditional.
