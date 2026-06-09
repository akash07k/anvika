# Keymap stays exhaustive; missing bindings are backfilled from defaults at the read boundary

The keymap schema (`KeymapSchema` in `packages/shared`) stays an EXHAUSTIVE record from every
action to a binding, but it is wrapped in `z.preprocess` that backfills any missing key from
`DEFAULT_KEYMAP` before validation. A new keymap action is therefore additive: existing persisted
settings rows (which hold a full keymap, because the server persists the whole settings object) are
backfilled to the new complete shape on read, so no migration and no settings-version bump are
needed. After backfill the validated value always holds every action; a user override still wins,
an unknown/garbage key is still rejected, and a corrupt non-object keymap recovers to defaults
instead of failing the whole settings load.

## Considered Options

- **Per-action migration (exhaustive, version-bumped):** rejected. Every new action would need a
  `CURRENT_SETTINGS_VERSION` bump and a 1->N migration; a forgotten migration makes a stored row
  fail validation, and `loadSettings` soft-resets ALL settings to defaults - a destructive footgun
  with no offsetting benefit (no consumer needs the on-disk row to be complete, since `useKeymap`
  merges defaults at read time anyway).
- **Partial record (`z.partialRecord`):** rejected. It tolerates a missing key but leaves persisted
  rows partial (completeness only resolved at read time) and is less robust against corrupt data (a
  non-object keymap fails the whole settings parse rather than recovering).

## Consequences

- Adding a keymap action is a one-line change to `KEYMAP_ACTIONS` + `DEFAULT_KEYMAP`; the schema and
  persistence need no further work.
- The validated/persisted keymap stays complete (tidy) and strict against unknown keys.
- The `z.preprocess` wrapper is the one piece of indirection a reader must understand - hence this
  ADR. First applied for the send-key-mode toggle (Alt+Enter) action.
