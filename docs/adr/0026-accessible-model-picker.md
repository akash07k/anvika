# The Settings model picker is two linked native selects with the connection baked into each option name

Status: Accepted.

The Settings model picker is TWO linked native `<select>` controls: a Connection filter and a Model
select. The Connection select is local-state only and narrows the Model list; it never writes the
stored selection. Under the "All" view the Model select both groups options by `<optgroup>` AND bakes
the connection into each option's accessible name, because screen readers announce `<optgroup>`
labels unreliably. This is a pure UI decomposition of one stored `selectedModelId`; the stored
contract, readiness, and the models payload are unchanged.

## Context

A model id is the namespaced `connectionId:model` (ADR 0004 as amended). With several connections
configured - and possibly several of the same type - a single flat select of every model is long and
gives a screen-reader user no sense of which connection a model belongs to. Native `<optgroup>` is
the obvious grouping, but its label is announced inconsistently by NVDA, JAWS, and VoiceOver,
especially while arrowing through options, so grouping alone does not reliably convey the connection
(see `docs/research/screen-reader-select-grouping.md`). The app targets screen-reader and keyboard
users, so the grouping has to be conveyed regardless of optgroup support.

## Decision

`ModelComboboxField` (`apps/web/src/components/fields/ModelComboboxField.tsx`), with the pure helpers in
`apps/web/src/lib/models/modelPicker.ts` and the connection components in
`apps/web/src/components/connections/`, renders two linked native selects:

- Select 1 "Connection" is a local-state FILTER: an "All" option plus one option per connection
  present in the models list. Changing it only sets local component state - it does NOT call
  `onChange` and does NOT write `selectedModelId`. Its initial value derives from the stored
  selection's connection (or "All" when nothing is selected or the stored model is unavailable, so
  the unavailable option stays reachable).
- Select 2 "Model" carries the stored value and reports the namespaced `connectionId:model` id on
  change. Under a SPECIFIC connection filter it shows that connection's BARE model display names
  (the connection is already chosen, so the name needs no qualifier). Under "All" it shows EVERY
  model grouped per connection by `<optgroup>` AND with the connection baked into each option's
  ACCESSIBLE NAME, for example "model (Venice)" (`optionLabel` returns
  `"displayName (connectionLabel)"` under "All").

A non-live count cue on the Model select describes the active filter ("N models, all connections" or
"N models from {label}"), so the filter's effect is discoverable without a chatty live region.

The stored `selectedModelId` contract, the readiness computation (ADR 0021), and the
`GET /api/v1/models` payload are UNCHANGED. This is purely a UI decomposition of one id into a
filter plus a selection; the public field shape is identical to the prior single-select.

## Considered Options

- **A single flat select of every model:** rejected. Long, and it gives no sense of which connection
  a model belongs to - exactly the orientation a screen-reader user needs when several connections
  (or several connections of one type) are configured.
- **A single select grouped only by `<optgroup>`:** rejected as insufficient. `<optgroup>` labels are
  announced unreliably across NVDA/JAWS/VoiceOver, so a user arrowing through options may never hear
  the connection. The optgroup stays (it helps where supported) but is not the guarantee.
- **A rich, filterable combobox now:** deferred. The rich in-chat model picker is a later step; the
  current Settings surface is well served by two native selects, which are robust and need no custom
  ARIA combobox implementation.

## Consequences

- A screen-reader user hears the owning connection for every model under "All" (baked into the option
  name) regardless of whether their reader announces `<optgroup>`, and can pre-narrow to one
  connection via the filter to hear bare names.
- The Connection filter is purely local, so navigating it never accidentally changes the stored
  model; only the Model select writes `selectedModelId`.
- Because the stored contract and the models payload are unchanged, this decomposition is reversible
  and does not affect the server, readiness, or persistence.
- Research backing the optgroup decision: `docs/research/screen-reader-select-grouping.md`.
