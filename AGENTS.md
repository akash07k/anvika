# AGENTS.md

Guidance for AI coding agents (Claude Code, GitHub Copilot, Codex, and others) working in
this repository. This file is the shared source of truth for all of them.

## Project

Anvika is an accessible AI application (Jan/OpenWebUI class) for screen-reader and keyboard
users - an orchestration layer over AI models (cloud providers and the user's own
already-running local server), NOT a model runtime (ADR 0005). The server is the heart
of the app; clients are thin (ADR 0001). Architecture: `ARCHITECTURE.md`. Roadmap: `ROADMAP.md`.
Glossary: `CONTEXT.md`. Decisions: `docs/adr/`.

Structure (Bun workspace): `packages/shared` (Zod schemas + types - the contract),
`apps/server` (Hono server), `apps/web` (Vite/React client), `tooling/` (scripts and the
launcher), with end-to-end tests under `tests/e2e/`.

## Conventions

Full conventions are in `docs/agents/conventions.md`. The hard, non-negotiable
requirements (ADR 0007):

- Authored source files sit in roughly the 250-450 line range (hard cap 450). Split files that
  grow. Exempt: generated/vendored files and lockfiles.
- KISS (Keep It Simple, Stupid) and separation of concerns throughout; code must be modular,
  extensible, readable, and maintainable.
- SOLID principles (Single responsibility, Open/closed, Liskov substitution, Interface
  segregation, Dependency inversion) are mandatory - above all, single responsibility: one
  responsibility and one reason to change per file.
- TSDoc/JSDoc on every exported function, type, and interface.
- No `any`, no non-null `!`, no `console` (use the LogTape logger); named exports only, no
  barrel files.
- Zod only at trust boundaries; never log prompt/response text by default (an explicit
  operator opt-in, `--log-content` / `ANVIKA_LOG_CONTENT`, may enable content logging in
  development); never log API keys, ever; Conventional Commits via Lefthook.
- Strict trust-boundary validation (MANDATORY for EVERY implementation, current and future - no
  exceptions, no PR is exempt; both directions): this is a hard requirement on all work, not a
  best-effort. Every value crossing a trust boundary (API request AND response bodies, route params
  and query strings, DB JSON read-back, file reads, client/server payloads, and SDK passthroughs
  like UIMessage metadata) is validated with a Zod schema in BOTH directions; never cast with `as`
  or trust an un-validated `JSON.parse` or SDK passthrough at a boundary. Use strict object schemas;
  reject malformed live input (HTTP 400) or fail soft to empty/default for disposable single-user
  persisted data. SCOPE is trust boundaries: do NOT add blanket runtime validation to internal calls
  (TypeScript covers internal type safety, per ADR 0007 and the project vision) - but within that
  scope it is non-negotiable, and it applies to every change that introduces or touches a boundary.
  Every new boundary ships with its both-direction schema and a test that malformed input fails
  safely; a PR that adds or touches a boundary without its schema and that test is INCOMPLETE and
  must not be opened. Full checklist: `docs/agents/zod-boundary-validation.md`. This standing
  practice keeps the validation backlog small.
- Official scaffolding only: add any framework, library, or new workspace app via its
  official initializer and documented setup - `bun create vite`, the official Tailwind v4
  plugin setup, `bun create playwright`, the `shadcn` CLI, `drizzle-kit`, `oxlint --init`,
  the TanStack Router plugin, and so on. Never hand-roll configuration that a library's own
  tooling generates. Confirm each tool's current official method via Context7 first. This
  does not apply to our own application source or to bare workspace packages that have no
  scaffolder (`packages/shared`, `apps/server`) - those we author normally.
- Document research as you go: whenever you research a library, framework, API, or
  technical approach (via Context7 or official docs), capture the findings in
  `docs/research/` - one file per topic, kept current - so the knowledge is durable rather
  than single-use.
- Keep the roadmap current (strict requirement): `ROADMAP.md` is the living, reader-facing
  status map and must never drift behind `main`. Treat updating it as part of the work for any
  change that changes project status - flip the finished entry's Status, advance the "Current
  position" block, and set the next entry to "Next" in the same change that lands the work.
- Self-check before pushing: run the self-check in `docs/agents/self-review.md` on your own
  diff, and run `bun run verify` (the full gate), before you push or open a pull request. Catch
  defects before a reviewer does.
- Thorough review before EVERY pull request (mandatory): before opening (or updating) a PR,
  review your full diff thoroughly across the quality dimensions relevant to the change, fix
  every real finding, and re-run `bun run verify` until green. Always cover the dimensions
  marked mandatory: correctness/logic and race conditions; concurrency and async correctness;
  content-safety and secret-leak (mandatory); accessibility for screen-reader and keyboard
  users (mandatory); error handling and resilience; API contract and backward compatibility;
  type safety and schema correctness; tests and coverage quality (mandatory); conventions and
  ADR 0007 compliance (mandatory); maintainability, SOLID, DRY, and readability; performance
  and resource usage; build, tooling, config, and dependencies; diagnostic-logging coverage
  (mandatory); documentation accuracy (spec/plan/ADR versus code, plus the plain-markdown
  rule); data integrity and persistence/migrations; and observability and operability. This is
  the deeper per-PR review on top of the per-commit self-check above. The goal is zero reviewer
  comments caused by a defect we could have caught ourselves.
- Diagnostic logging coverage (mandatory quality dimension): diagnostic logging is a
  first-class, never-silently-forgotten part of every change. The full logging standard is
  `docs/agents/logging.md`. Before opening or updating a PR, review diagnostic logging coverage
  alongside the correctness, accessibility, and security dimensions: every new use-case emits a
  content-safe outcome log at `info`; recoverable problems log at `warning` and failures at
  `error`; no new free-form content or secret crosses a log boundary; new client events are
  typed `DiagnosticEvent` variants, new server events use `serverLogger(category).level(...)`.
  This dimension is part of the work for every change: the standard is honored and logging
  coverage holds.

## Documentation lookup - Context7 (mandatory)

Context7 is an MCP server that pulls up-to-date, version-specific documentation and code
examples for libraries straight from the source, so agents do not rely on stale or
hallucinated APIs. Anvika's stack moves fast (AI SDK, Hono, Drizzle, Zod v4, TanStack,
react-hotkeys-hook, Streamdown, oxlint/oxfmt, Bun); training data lags behind it. These
rules are non-negotiable:

- Before writing or changing code that uses any library, framework, SDK, API, CLI tool, or
  cloud service - even well-known ones - consult the current docs through Context7 first.
  This covers API syntax, configuration, setup, version migrations, and library-specific
  debugging. Do this even when you think you already know the answer; your training data may
  be out of date.
- Workflow: call `resolve-library-id` with the library name to get its `/org/project` ID,
  then `query-docs` with that ID and the full question (not a single keyword). Skip
  `resolve-library-id` only when the user gives an exact `/org/project` ID.
- Prefer Context7 over web search for library documentation. Use web search only for things
  Context7 does not cover.
- Do not use Context7 for refactoring, writing scripts from scratch, debugging our own
  business logic, code review, or general programming concepts - those are not library
  lookups.

## AI SDK first (mandatory)

Before implementing any chat or orchestration capability, check whether the AI SDK already provides
it (consult the installed `ai` / `@ai-sdk/*` source and docs, per the ai-sdk skill and ADR 0009);
build our own only when the SDK lacks it or its version is insufficient for our needs. Hand-rolled
reimplementations of SDK-provided behavior (message send, edit, regenerate, streaming, tool loops)
are rejected in review unless a documented gap justifies them. When the answer is non-obvious, record
the check in the relevant `docs/research/` note so it is durable.
