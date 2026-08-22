# Feature: React Compiler form and connection effects

**From build-plan:** feature 7aaa
**Status:** complete

## Goal

Refactor the form and connection components that candidate Oxc React Compiler
lint identifies, without changing their controlled-input semantics,
screen-reader-visible state, or keyboard focus restoration. This clears the
first eight of 38 React Compiler diagnostics before feature 7aaf turns those
rules into the required lint gate.

## In scope

- `TextField` and `NumberField` state synchronization that currently sets local
  draft state directly from an effect.
- `ModelComboboxField` first-result highlighting when its source models, scope,
  or query changes.
- `ManualModelsEditor` and `HeadersEditor` focus restoration after adding or
  removing a dynamic row.
- `ConnectionsFieldset` focus restoration after save, cancellation, and failed
  removal flows.
- Focused unit and browser tests that prove the affected input, selection, and
  focus behavior remains unchanged.
- A candidate Oxc scoped lint run over only these six source files.

## Out of scope

- Updating `oxlint`, `oxlint-tsgolint`, `bun.lock`, lint scripts, or
  `.oxlintrc.json`; feature 7aaf owns the required gate adoption.
- Any temporary lint suppression, rule downgrade, ignore-pattern expansion, or
  compatibility workaround.
- Chat lifecycle, cross-tab synchronization, shortcut, focus, reasoning,
  presentation, and end-to-end AxeBuilder import diagnostics; features 7aab
  through 7aae own them.
- HTTP routes, shared schemas, persistence, Provider behavior, and user-visible
  settings or connection contracts.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the current step before changing files.
2. Implement only that step and show its diff.
3. Review the diff and confirm its observable done-when.
4. Obtain approval before moving to the next step or creating an optional
   checkpoint.

## Build steps

- [x] **Step 1 - Preserve controlled text and number field drafts without
  synchronous effect state updates** - refactor `TextField` and `NumberField`
  to reconcile external values and local edits through a React
  Compiler-compliant state model. Add focused tests for external value changes,
  uncommitted typing, blur commits, formatted numbers, and invalid numeric
  drafts. *Done when:* parent-provided value changes still appear in both controls,
  unrelated parent re-renders do not discard active typing, only a changed valid
  value commits, and no candidate React Compiler diagnostic remains in either
  field component.

- [x] **Step 2 - Make model-result highlighting compiler-safe** - replace the
  synchronous effect that updates `ModelComboboxField` highlight state with a
  compiler-compliant derivation or event transition. Extend its browser
  coverage for initial opening, query changes, scope changes, and model-list
  replacement while preserving arrow-key selection. *Done when:* the first
  available result is highlighted after each filtering transition, manual
  arrow-key selection remains intact, the existing accessible trigger and cue
  behavior stays true, and the scoped candidate lint has no diagnostic for the
  component.

- [x] **Step 3 - Restore dynamic-editor focus without effect state clearing** -
  refactor `ManualModelsEditor` and `HeadersEditor` so add and removal focus
  requests are consumed without synchronous state updates in a layout effect.
  Retain the current accessible names and secret-safe header-value behavior.
  *Done when:* adding focuses the new input, removing focuses the correct
  surviving input or Add button, header value labels remain associated without
  exposing stored values, and both focused test suites pass without candidate
  diagnostics.

- [x] **Step 4 - Preserve connection-form focus transitions without effect state
  clearing** - refactor `ConnectionsFieldset` focus handling for saved,
  cancelled, and failed optimistic operations. Keep the retry-on-next-render
  behavior when a saved row is not mounted yet. *Done when:* save, cancel, and
  failed remove flows focus the saved heading or intended opener rather than
  `<body>`, the existing connection mutation and diagnostic-announcement
  behavior is unchanged, and the candidate lint has no diagnostic in the
  fieldset.

- [x] **Step 5 - Prove the bounded remediation** - run the affected unit and
  browser test files, then lint the six feature source files with the candidate
  Oxc version and type-aware mode. Run the repository verification gate after
  reviewing the complete diff. *Done when:* all affected tests pass, the
  candidate scoped lint reports zero diagnostics for the six source files,
  `bun run verify` passes, and no lint suppression or toolchain configuration
  change was added.

## Files / areas

- `apps/web/src/components/fields/TextField.tsx` and
  `apps/web/src/components/fields/NumberField.tsx` - controlled draft state.
- `apps/web/src/components/fields/ModelComboboxField.tsx` - result highlight
  state.
- `apps/web/src/components/connections/ManualModelsEditor.tsx` and
  `apps/web/src/components/connections/HeadersEditor.tsx` - dynamic row focus.
- `apps/web/src/components/connections/ConnectionsFieldset.tsx` - connection
  form and list focus transitions.
- Existing colocated `TextField`, `ModelComboboxField`, `ManualModelsEditor`,
  `HeadersEditor`, and `ConnectionsFieldset` tests; add a focused
  `NumberField` test file if its committed-value behavior has no suitable
  existing coverage.

## Data / contracts

- No HTTP, persisted-data, shared-Zod, or client/server contract changes.
- Local draft state is load-bearing: a changed external value replaces the
  control draft, while an unrelated parent re-render retains the active draft;
  commit callbacks retain their existing value and timing semantics.
- Focus is an accessibility contract: after a dynamic add, remove, save,
  cancellation, or rollback, focus must land on a mounted intended control and
  never fall through to `<body>`.

## Testing

- Expand Node/jsdom tests for controlled draft and commit transitions,
  dynamic-row add/remove focus, header label associations, and connection
  rollback focus.
- Extend the existing browser-mode model-combobox test for result highlighting
  and keyboard selection after each state transition.
- Run the affected test files through the existing `node`, `web`, and
  `web-browser` projects, then run `bun run verify`.
- Run the candidate Oxc release with `--type-aware` against only the six source
  files in scope. The broader candidate lint remains intentionally incomplete
  until features 7aab through 7aae finish.

## Notes for the AI

- This is client-only work. Preserve the thin-client architecture; do not
  introduce routes, persistence, or contract changes.
- Keep WCAG 2.2 AA behavior explicit: use accessible queries in tests, preserve
  visible focus, semantic controls, keyboard operation, and non-live status
  behavior.
- Treat candidate React Compiler diagnostics as behavior risks, not as style
  warnings. Fix the ownership or lifecycle model rather than adding an inline
  disable, weakening a rule, or changing an ignore pattern.
- Do not add dependencies or modify Oxc configuration. Feature 7aaf owns the
  coordinated `oxlint` and `oxlint-tsgolint` update, final rule adoption,
  generated lockfile, and full-repository candidate lint proof.
- Preserve content-safe diagnostic logging and existing typed diagnostic events.
- Follow the existing named-export, strict-TypeScript, TSDoc, and source-size
  conventions. Use Context7 before changing any library API.
