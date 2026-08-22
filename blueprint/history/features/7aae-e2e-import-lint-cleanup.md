# Feature: E2E import lint cleanup

**From build-plan:** feature 7aae
**Status:** not started

## Goal

Replace every default `AxeBuilder` import in the Playwright E2E suite with the
documented named import. Preserve all existing axe audit behavior, tags, scopes,
and test flow while removing the import style that violates the adopted lint rules.

## In scope

- Convert all 11 `@axe-core/playwright` default imports in `tests/e2e/` to
  `import { AxeBuilder } from '@axe-core/playwright';`.
- Preserve every existing `AxeBuilder` constructor call, chain, WCAG tag set,
  include scope, assertion, and test configuration unchanged.
- Prove no default `AxeBuilder` import remains and run the project quality gate.

## Out of scope

- Upgrading `@axe-core/playwright`, Playwright, Oxc tooling, or any other
  dependency.
- Changing axe rules, WCAG tags, test coverage, assertions, timing, or
  accessibility behavior.
- Enabling the Oxc lint gate work planned for feature 7aaf.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you have not read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - Convert root, chat, and settings E2E imports** - Update the
  `AxeBuilder` declarations in the root smoke, chat, and settings E2E specs to
  use the named import, without changing their audit calls. *Done when:* the
  seven targeted files import `{ AxeBuilder }`, their existing axe assertions
  remain unchanged, and `bun run lint` passes.
- [x] **Step 2 - Convert connections and conversation E2E imports** - Update
  the named import in the connections helper and test spec plus the two
  conversation E2E specs, without changing shared helper behavior or scoped
  audits. *Done when:* all 11 affected E2E files import `{ AxeBuilder }`, a
  repository search finds no
  `import AxeBuilder from '@axe-core/playwright'` declaration, and
  `bun run lint` passes.
- [x] **Step 3 - Verify the unchanged E2E contract** - Run the E2E suite and
  the documented full quality gate after the import-only migration. *Done when:*
  `bun run e2e` and `bun run verify` pass with the existing axe assertions and
  accessibility checks intact.

## Files / areas

- `tests/e2e/smoke.spec.ts`
- `tests/e2e/chat/chat.spec.ts`
- `tests/e2e/chat/conversation-persistence.spec.ts`
- `tests/e2e/chat/copy.spec.ts`
- `tests/e2e/chat/usage-metadata.spec.ts`
- `tests/e2e/settings/first-run-and-names.spec.ts`
- `tests/e2e/settings/settings-persistence.spec.ts`
- `tests/e2e/connections/connections-helpers.ts`
- `tests/e2e/connections/connections-test-picker.spec.ts`
- `tests/e2e/conversations/conversation-model.spec.ts`
- `tests/e2e/conversations/multi-conversation-axe.spec.ts`

## Data / contracts

- None. This is a test-only ECMAScript import syntax correction. The existing
  `AxeBuilder` API, Playwright page input, axe results, and accessibility
  assertions are load-bearing but unchanged.

## Testing

- Run `bun run lint` after each import group to catch import-style and
  type-aware diagnostics.
- Search the repository for the exact former default-import declaration after
  all changes; it must return no results.
- Run `bun run e2e` to prove the Playwright and axe audits retain their runtime
  behavior.
- Run `bun run verify` as the full project gate. No new test is needed because
  the feature changes no application logic or assertion behavior.

## Notes for the AI

- Test-only work: do not touch server, shared-contract, client application, or
  dependency files.
- Use the documented named export:
  `import { AxeBuilder } from '@axe-core/playwright';`.
- Do not alter tag lists, `.include()` use, `.analyze()` calls, assertion
  expressions, test names, comments, or import ordering beyond the syntax
  change required for this feature.
- Preserve the existing accessible role-based test interactions and axe coverage
  exactly; this feature is lint cleanup, not an accessibility-test redesign.
