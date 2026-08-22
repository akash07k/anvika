# Feature: Toolchain and test-platform modernization

**From build-plan:** feature 7a
**Status:** complete

## Goal

Modernize the workspace's package-manager, static-quality, and test-runner
dependencies without changing application behavior. Keep the existing build and
verification gates operational, including browser accessibility and end-to-end tests.

## In scope

- Root development dependencies for static analysis, formatting, commit hooks,
  Markdown linting, TypeScript, and test execution.
- 7a owns only root `@axe-core/playwright`, `@commitlint/*`, `@playwright/test`,
  `@testing-library/*`, `@vitest/browser-playwright`, `axe-core`, `dotenv`, `jsdom`,
  `lefthook`, `markdownlint-cli2`, `oxfmt`, `typescript`, `vitest`, and
  `vitest-browser-react`, plus `apps/server`'s `@types/bun`. Feature 7aa owns
  `oxlint` and `oxlint-tsgolint`; `drizzle-kit` remains owned by feature 7b.
- `apps/server`'s `@types/bun` version and the root `packageManager` field, kept aligned
  with the Bun version selected for this feature.
- The generated `bun.lock` resolution after each targeted dependency update.
- Compatibility changes to TypeScript, Vitest, Playwright, oxlint, oxfmt, Lefthook, or
  test configuration only when their documented upgrade requirements demand them.
- Current Context7 consultation before each selected tool change, without creating or
  updating files under `docs/research/`.

## Out of scope

- AI SDK core, Provider, OpenRouter, and React migration work (feature 7c).
- Hono, Drizzle, Zod, LogTape, Commander, and other Server or shared runtime updates
  (feature 7b).
- React, Vite, Tailwind, TanStack, Radix/shadcn, Streamdown, and application web
  dependency updates (feature 7d).
- Changes to API contracts, persistence schemas, routes, user-facing chat behavior, or
  accessibility behavior.
- Standalone binary compatibility work beyond the final verification gate (feature 7e).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan the current step before changing files.
2. Implement only that step and show its diff.
3. Review the diff and confirm its observable done-when.
4. Obtain approval before moving to the next step or creating an optional checkpoint.

## Build steps

- [x] **Step 1 - Establish the upgrade baseline and compatibility decisions** - run
  workspace-scoped dependency reports, classify every 7a package as a patch, minor, or
  major update, and consult current official documentation before selecting targets.
  Present the selected versions, migration requirements, and deliberately deferred
  packages in the step review without adding a `docs/research/` artifact.
  *Done when:* every 7a package has an explicit target and reviewed rationale, the AI
  SDK, Server runtime, and web-runtime package groups are deferred, and no manifest,
  lockfile, or `docs/research/` file has changed.

- [x] **Step 2 - Modernize the package manager and static-quality toolchain** - update
  the root `packageManager`, Commitlint, Lefthook, and `apps/server`'s `@types/bun`.
  Regenerate `bun.lock` with targeted Bun commands. Feature 7aa owns the Oxc upgrade
  and any lint-rule remediation.
  *Done when:* the root package-manager version and `@types/bun` agree, the lockfile
  resolves the selected packages, and `bun run typecheck`, `bun run lint`,
  `bun run format:check`, and `bun run md:lint` pass.

- [x] **Step 3 - Modernize the test and accessibility runner stack** - update Vitest,
  the Vitest Playwright browser adapter, Playwright, selected Testing Library packages,
  user-event, and axe. Change `axe-core` to the selected compatible caret range, and
  retain jsdom 29 until its major migration is separately scoped. Make only documented
  compatibility changes to `vitest.config.ts`, `tests/e2e/playwright.config.ts`, and
  test setup files.
  *Done when:* the `node`, `web`, and `web-browser` project boundaries remain intact,
  E2E tests still force `ANVIKA_LOG_CONTENT=false`, and `bun run test`,
  `bun run test:bun`, `bun run test:browser`, and `bun run e2e` pass.

- [x] **Step 4 - Prove the modernized toolchain is reproducible** - review all package,
  lockfile, and configuration changes for scope boundaries, then run the complete
  verification gate from a clean dependency resolution.
  *Done when:* `bun install --frozen-lockfile` completes without modifying `bun.lock`,
  `bun run verify` passes, and no dependency from features 7b through 7e changed.

- [x] **Step 5 - Resolve the browser-test cmdk pre-bundling warning** - configure the
  `web-browser` Vitest project so `cmdk` resolves from the `apps/web` workspace during
  dependency pre-bundling, without adding a duplicate root dependency or suppressing the
  warning. Preserve the single React runtime that the existing pre-bundling rule protects.
  *Done when:* `bun run test:browser` completes without the `cmdk` resolution warning, the
  Command-based browser tests pass, and the browser project preserves its existing test boundary.

- [x] **Step 6 - Stabilize the conversation-surface E2E readiness proof** - replace the stale
  assertion against the transient route-loading heading with assertions for the loaded draft
  surface that the test deliberately seeds. Keep its accessibility audit and use the existing
  manual-model fixture pattern when required to avoid auditing a loading-only control state.
  *Done when:* the isolated conversation-surface E2E test passes from a clean data directory and
  `bun run verify` is green.

- [x] **Step 7 - Provide router context to the conversation focus browser fixture** - mount the
  real `ConversationView` through a minimal in-memory TanStack Router so its router-aware
  descendants run under `RouterProvider`. Do not suppress the warnings or alter production routing.
  *Done when:* the focus browser tests pass without the `useRouter` context warning, and a serial
  browser-suite run identifies any remaining warning categories for follow-up.

## Files / areas

- `package.json` - root package-manager metadata and scoped development dependencies.
- `apps/server/package.json` - Bun type definitions only.
- `bun.lock` - generated dependency resolution; never hand-edit.
- `tsconfig.json`, `tsconfig.base.json`, and `lefthook.yml` - only if the selected
  static-quality tools require compatible configuration.
- `vitest.config.ts`, `tests/e2e/playwright.config.ts`, and relevant test setup files -
  only if the updated runner APIs require compatible configuration.
- `apps/web/src/test-setup.ts` - only if an updated Testing Library or jsdom integration
  requires compatible setup.
- `tests/e2e/chat/chat.spec.ts` - stable loaded-surface accessibility proof for the upgraded
  Playwright runner.
- `apps/web/src/components/ConversationView.focus.browser.test.tsx` - router-aware focus
  regression fixture.

## Data / contracts

- No HTTP, persisted-data, or client/server Contract changes are allowed.
- The root `packageManager` version and `apps/server` `@types/bun` must remain aligned.
  This is load-bearing for the Server TypeScript environment.
- Preserve the named Vitest projects and their test boundaries: `node`, `web`, and
  `web-browser`; Bun SQLite tests remain outside Vitest.
- Preserve Playwright's serial execution, health check, local data directory, and
  forced content-logging opt-out.

## Testing

- Step 2 runs static checks: `bun run typecheck`, `bun run lint`,
  `bun run format:check`, and `bun run md:lint`.
- Step 3 runs the existing test partitions: `bun run test`, `bun run test:bun`,
  `bun run test:browser`, and `bun run e2e`.
- Step 4 runs `bun run verify` as the final gate.
- Step 5 runs `bun run test:browser` and confirms the `cmdk` dependency resolves without a warning.
- Step 6 runs the isolated conversation-surface E2E test from clean data, then `bun run verify`.
- Step 7 runs the focus browser test and a serial browser-suite warning inventory, then
  `bun run verify`.
- No new application logic is planned. Add or update a regression test only when a
  documented tool upgrade changes test, compiler, lint, or accessibility-runner
  behavior.

## Notes for the AI

- Use the `Update` and `Latest` columns from `bun outdated` deliberately. Do not blindly
  run a workspace-wide latest update or pull packages owned by features 7b through 7e.
- Before changing any tool or framework version, consult its current official
  documentation through Context7. Do not create or update `docs/research/` files.
- If a candidate major update requires broad application-code changes, stop and request
  a further split rather than hiding that work in this feature.
- Oxc and React Compiler lint adoption belongs to feature 7aa. Do not add temporary
  rule suppressions or compatibility workarounds to advance this feature.
- Preserve strict TypeScript settings, ESM configuration, content-safe test logging,
  accessibility coverage, and the existing script names.
- Use generated Bun tooling for manifest and lockfile changes. Do not hand-edit
  `bun.lock`.
