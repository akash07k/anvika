# Testing

How Anvika is tested, which runner owns which kind of test, and the traps that bite people
who run only part of the suite before pushing.

## The verify gate

`bun run verify` is the gate of record. Run it, green, before any push. It runs each step in
order and stops at the first failure:

- `bun run typecheck` - `tsc --build` across the workspace.
- `bun run lint` - oxlint over the repo.
- `bun run format:check` - oxfmt formatting check.
- `bun run md:lint` - markdownlint over every `*.md`.
- `bun run test` - the fast Vitest projects (`node` and `web`).
- `bun run test:bun` - the Drizzle adapter tests under the Bun runtime.
- `bun run test:browser` - the real-Chromium Vitest project (`web-browser`).
- `bun run e2e` - the Playwright end-to-end suite.

Passing the pre-commit hook is not the same as passing the gate. The hook runs only a subset
(see the next section), so always run the full `bun run verify` before you push.

## The three Vitest projects

`vitest.config.ts` defines three projects, and which one a test belongs in is a deliberate
choice:

- `node` - plain Node environment. For server code, shared packages, and tooling. Covers
  everything under `packages/`, `apps/server/`, and `tooling/`.
- `web` - jsdom environment. For React component and hook tests that do not need a real
  browser - logic, rendering shape, and anything jsdom can simulate.
- `web-browser` - a real headless Chromium driven through Playwright. For tests that need
  things jsdom cannot give you: real focus, the `document.ariaNotify` API, real keyboard
  events, and genuine role and landmark resolution. These live in `*.browser.test.tsx` files.

Rule of thumb: write a test in `web` (jsdom) if it asks "did the component render the right
thing", and in `web-browser` if it asks "does focus, a live keyboard event, or a real
accessibility role behave correctly". Server and shared logic goes in `node`.

The trap to know before you push: the pre-commit hook (`lefthook.yml`) runs `bun run test`,
which is only the `node` and `web` projects. It does NOT run `web-browser`. So a focus test, a
keyboard test, or a role and landmark test can pass the commit and still be broken, because the
project that exercises it never ran. Those tests run only under `bun run test:browser`, which
`bun run verify` includes. Always run the full gate before pushing - a green commit is not a
green push.

## bun:sqlite tests

`import { Database } from 'bun:sqlite'` fails under Vitest. Vitest runs its workers in Node even
when you launch it through `bun run`, and there is no Bun worker pool, so any module that imports
`bun:sqlite` (or `drizzle-orm/bun-sqlite`) cannot run under Vitest at all.

The split that resolves this (ADR 0010):

- The Drizzle-over-Bun-SQLite adapter and the migration runner are tested in `*.bun.test.ts`
  files, run by the Bun test runner. The `test:bun` script runs them:
  `bun test ./apps/server/src/persistence/**/*.bun.test.ts`. It is part of `bun run verify`.
- Everything behind the `ConversationStore` port - the save policy, outcome mapping, the routes,
  the app wiring, and the client - is tested under Vitest against an in-memory fake
  `ConversationStore` injected through that port. No real database is needed.

The dependency-inversion boundary is what makes this clean: only the thin adapter needs the Bun
runtime, so the runtime split is confined to one small group of files. The `bun:sqlite` and
`drizzle-orm/bun-sqlite` imports stay inside `persistence/drizzle/` and the `server.ts`
composition root, keeping them out of the Vitest module graph entirely. The Vitest `node`
project also excludes `**/*.bun.test.ts` so the two runners never collide.

## End-to-end (Playwright)

The end-to-end suite lives under `tests/e2e/` and runs against a built web client served by a
real server (`tests/e2e/playwright.config.ts`). A few mechanics are worth knowing:

- Content logging is forced off. The config sets `webServer.env` to
  `{ ANVIKA_LOG_CONTENT: 'false' }` for the spawned server. This holds regardless of the repo
  `.env`: Playwright merges its `env` over `process.env`, and Bun honors a real environment
  variable over a `.env` value, so end-to-end runs never log message text.
- Two-tab tests share one browser context. A `BroadcastChannel` is partitioned per
  browsing-context group and cannot cross two isolated `browser.newContext()` profiles, so the
  cross-tab sync test opens a second page in the SAME context (`page.context().newPage()`) rather
  than a second context. Two isolated contexts leave the second tab stale and the test fails for
  the wrong reason.
- Live and streaming tests are credential-gated. The live chat test uses `test.skip` when the
  required credentials are absent from the environment, so credential-free continuous integration
  stays green. Bun auto-loads `.env` for the server it spawns; the Playwright runner loads the
  same `.env` so its workers see those variables too.
- The persistence-reload test waits for stream completion before reloading. The composer is
  disabled while a response is in flight, so the test waits for the Send button to become enabled
  again - which confirms the stream finished and the turn was saved - before calling
  `page.reload()`. Reloading mid-stream would race the server-side persistence write.

The suite runs serially (one worker) because the app persists a single conversation row per
owner, so every chat-sending test mutates the same shared row and parallel workers would race it.

## Accessibility testing

Accessibility is tested at every layer, not bolted on at the end:

- axe runs in the end-to-end suite and the gate is zero violations on the checked surfaces.
- Tests query the way a user perceives the page: by role, accessible name, and label, never by
  test-only identifiers or implementation details. An accessible-queries-only discipline means a
  test that passes is also evidence the surface is reachable by a screen reader (ADR 0002).
- Unit and component tests use a mock model so streaming, status, and announcement behavior are
  deterministic and need no network or credentials.
- A manual screen-reader pass is required before a change is done; automated checks cannot catch
  everything a real screen reader exposes. The manual procedure is in
  `docs/accessibility/manual-test-plan.md`.

See `docs/accessibility/` for the full accessibility contract and the manual test plan.
