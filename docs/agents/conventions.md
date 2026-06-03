# Anvika conventions

Operative conventions for everyone working in this repo, humans and coding agents alike. These are the rules to follow. The architecture decisions are in `docs/adr/`, and the domain vocabulary is in `CONTEXT.md`.

## Hard requirements (non-negotiable - ADR 0007)

- **File size**: authored source files sit in roughly the 250-450 line range, with 450 a hard cap - split anything that outgrows it. It is a ceiling, not a quota: smaller is fine, files are never padded to fill it, and size is never a license to merge concerns. Exempt: generated files (migrations, route trees), lockfiles, and vendored third-party source (shadcn/AI Elements).
- **KISS (Keep It Simple, Stupid) and separation of concerns**, everywhere. Each unit has one clear purpose, a narrow interface, and is understandable and testable on its own.
- **SOLID principles** (Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion) are mandatory. Above all, single responsibility: every file has one responsibility and one reason to change (this pairs with the file-size limit). The rest apply in a TypeScript/modular idiom - extend by adding, depend on abstractions, inject dependencies. See ADR 0007.
- **Modular, extensible, readable, maintainable** code is a requirement, not a nicety.
- **TSDoc/JSDoc on every exported** function, type, and interface: a one-line summary plus param/return notes where the names do not tell the story. Internal comments explain why, not what.

## Repo structure (ADR 0001)

Bun workspace:

- `packages/shared` - Zod schemas and types; the typed contract shared by every client.
- `apps/server` - the Hono server; the heart of the app (model orchestration, persistence, settings).
- `apps/web` - the Vite/React client; thin, owns presentation and accessibility.

Keep business logic in the server; keep clients thin.

## Language

Use the `CONTEXT.md` glossary terms (Server, Client, Contract, Conversation, Message, Turn, Owner, Provider, Model, Model id, Assistant, Skill, ...) and avoid the synonyms it lists.

## Code style (spec section 15)

- Strict TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `verbatimModuleSyntax`.
- Named exports only; no barrel files; `import type` for type-only imports; grouped imports.
- No `any` (use `unknown` and narrow); no non-null `!`; no `ts-ignore`/`ts-expect-error` without a tracked issue.
- No `console` - use the LogTape logger. No inline styles - Tailwind classes only. No magic numbers - extract a named constant.
- Formatting by oxfmt: print width 100, two-space indent, semicolons, single quotes, trailing commas, parenthesised arrow parameters.
- Naming: kebab-case files (PascalCase for React component files), camelCase variables/functions, PascalCase types/interfaces/classes, SCREAMING_SNAKE_CASE true constants, hooks `useSomething`, booleans `is`/`has`/`should`.
- React 19 function components only; props destructured at the signature; ref as a normal prop; one exported component per file.

## Documentation lookup - Context7 (mandatory)

Before writing or changing code that uses any library, framework, SDK, API, CLI tool, or cloud service, consult its current documentation through the Context7 MCP first - even for well-known libraries, and even when you think you know the answer (training data lags our stack). Workflow: `resolve-library-id` then `query-docs`. Prefer Context7 over web search for library docs. See the mandatory rule in `AGENTS.md`.

## Official scaffolding (mandatory)

Add any framework, library, or new workspace app through its official initializer and documented setup - `bun create vite` for the web app, the official Tailwind v4 plugin setup, `bun create playwright` for E2E, the `shadcn` CLI, `drizzle-kit` for the database, `oxlint --init` for lint config, the TanStack Router plugin for routing, and so on. Never hand-write configuration that the library's own tooling generates; confirm the current official method via Context7 before running it. Exceptions are our own application source and the bare workspace packages that have no scaffolder (`packages/shared`, `apps/server` - a `package.json`, a `tsconfig.json`, and our code), which we author normally. Markdown documents are formatted by markdownlint (markdownlint-cli2 `--fix`); oxfmt is scoped to source code (ts/tsx/js/json) and never reflows authored prose, licenses, or docs.

## Research documentation (mandatory)

Whenever you research a library, framework, API, or technical approach, record the findings in `docs/research/` - one file per topic, kept current - so the knowledge is durable and reviewable, not consumed by a single action. Cite the official source. New research must leave a durable artifact there, not just inform one edit.

## Validation - Zod at boundaries

Zod validates untrusted data at trust boundaries only: API request/response bodies, config and files, URL params, and JSON read back from SQLite. Not on internal calls (TypeScript covers those). Shared schemas live in `packages/shared`; derive types with `z.infer`.

## Logging

LogTape, hierarchical categories (`anvika.server.*`, `anvika.client.*`; forwarded client logs are forced under `anvika.client.*`). Privacy: never log prompt or response text by default. An explicit operator opt-in (`--log-content` or `ANVIKA_LOG_CONTENT`) may enable content logging - default off for production and public deployments, on for development via the `dev:server` command. API keys are never logged, in any mode. See ADR 0008.

## Errors

The canonical `{ code, message, details? }` contract from `packages/shared` (spec section 17). The typed client validates and throws, switching on `code`; the UI renders its own accessible message.

## Accessibility (spec section 19)

WCAG 2.2 AA. Honour the forbidden-patterns list (no removed focus outline without a replacement; no `tabindex` other than 0 or -1; no interactive div/span without a role and keyboard handlers; no colour-only state; respect reduced motion; modals trap focus and Escape closes; no `aria-hidden` on a focusable element; a placeholder is not a label). Component tests use accessible queries only.

## Testing (spec section 20, ADR 0002)

Vitest with accessible queries and the AI SDK mock model for unit and component tests; a hybrid of jsdom plus a Vitest Browser Mode project for accessibility-critical surfaces; Playwright + axe (zero violations) for keyboard-only end-to-end; a manual NVDA/JAWS pass as the final gate. Test files are `<name>.test.ts` beside the source.

## Self-check (mandatory before pushing)

Before you push or open a pull request, run the pre-pull-request self-check in
`docs/agents/self-review.md` on your own diff, and run `bun run verify` (the full
gate in one command). The checklist's review dimensions (boundary, hostile-input,
seam, state-space, verify-the-artifact, verify-the-claim, consistency, stale-neighbor)
exist to catch defects before a reviewer does; each is grounded in a real past
review comment.

## Commits

Conventional Commits, enforced by commitlint via Lefthook. Do not add AI-attribution trailers to commits or pull requests.

### Branching and merge workflow

Linear history only. Branch from `main` with a meaningful name shaped as `<conventional-type>/<short-summary>` (for example `feat/model-picker`, `fix/health-route-version`). Keep commits atomic and conventional. If `main` advances while you work, rebase the branch onto `main` (`git rebase main`) - never merge `main` into the branch. Merge pull requests with GitHub's "Rebase and merge" only: the repository allows rebase merges and disables merge commits and squash, so `main` stays linear and every atomic commit is preserved. Do not force-push a shared branch without coordination, and never force-push `main`.

## Pointers

- Architecture decisions: `docs/adr/`.
- Glossary: `CONTEXT.md`.
- Self-check checklist: `docs/agents/self-review.md`.
