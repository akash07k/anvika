# Anvika - Project Overview

> **Generated file. Do not hand-edit.** Regenerate this file with `/overview` when
> `blueprint/project-plan.md` or `blueprint/build-plan.md` changes.

Anvika is a local-first, accessible AI orchestration application for screen-reader
and keyboard users. It connects to cloud Providers and an already-running local
server, but never runs, hosts, downloads, or manages AI models itself.

## Problem

Existing AI clients can depend on visual-only controls, inaccessible navigation, or
noisy streaming announcements. Anvika provides predictable keyboard-first and
screen-reader-aware AI interactions without taking responsibility for model hosting.

## Users

- Screen-reader users who need predictable announcements, focus behavior, and
  semantic navigation.
- Keyboard-only users who need complete non-pointer interaction.
- Local-first users who want to connect Provider accounts or a local model server
  without operating an inference runtime.

## Features

1. **Shared Contract and API foundation (shipped)** - versioned Hono routes, shared
   Zod schemas, canonical errors, and local persistence boundaries.
2. **Accessible streamed chat (shipped)** - keyboard-first, screen-reader-aware
   conversations over cloud Providers and an already-running local server.
3. **Provider, model, and settings management (shipped)** - configure connections,
   discover and select models, and apply generation preferences safely.
4. **Multi-conversation management (shipped)** - create, load, rename, pin, branch,
   delete, and restore persisted conversations with optimistic concurrency.
5. **Per-conversation generation controls (shipped)** - apply model and reasoning
   overrides while preserving Server-side resolution rules.
6. **Local operation and quality infrastructure (shipped)** - diagnostics,
   content-safe logging, automated verification, accessibility checks, and
   standalone binary packaging.
7. **Dependency modernization (in progress)** - preserve the API-first architecture
   and accessibility contract through coordinated compatibility work.
   - **7a. Toolchain and test-platform modernization (shipped)** - updated workspace
     build, lint, formatting, and test dependencies while restoring quality gates.
   - **7aa. Oxc and React Compiler lint adoption (in progress)** - update compatible
     Oxc tooling and remediate diagnostics without temporary suppressions.
     - **7aaa. React Compiler form and connection effects (shipped)** - remediated
       field and connection effect diagnostics without changing controlled-input or
       keyboard-focus behavior.
     - **7aab. React Compiler chat lifecycle (shipped)** - remediated ref, mutation,
       and memoization diagnostics in chat lifecycle hooks.
     - **7aac. React Compiler conversation synchronization (shipped)** - remediated
       ref and synchronization diagnostics in cross-tab and conversation code.
     - **7aad. React Compiler navigation and presentation (shipped)** - remediated
       diagnostics in shortcuts, focus, reasoning, and presentation components.
     - **7aae. E2E import lint cleanup (next)** - replace default AxeBuilder imports with
       the documented named import across end-to-end tests.
     - **7aaf. Oxc lint gate adoption** - enable React Compiler diagnostics as errors,
       remove obsolete directives, regenerate `bun.lock`, and restore the full gate.
   - **7b. Server and shared runtime modernization** - update Hono, Drizzle, Zod,
     LogTape, and related dependencies while preserving the versioned API and SQLite.
   - **7c. AI SDK v7 migration** - update AI SDK core, Providers, React integration,
     and OpenRouter together while preserving chat persistence and accessibility.
   - **7d. Web runtime modernization** - update UI dependencies while preserving
     keyboard and screen-reader behavior.
   - **7e. Distribution compatibility** - resolve remaining upgrade regressions and
     confirm local serving, end-to-end flows, and standalone build behavior.
8. **Existing and post-upgrade bug fixes** - repair known existing bugs and migration
   regressions after dependency modernization.
9. **Existing-experience enhancements** - improve the current implementation after
   dependency and bug-fix work.
10. **Image and document attachments** - let conversations include files and images
    for a Model to process.
11. **Custom Assistants and prompt library** - create reusable instruction, model,
    generation-setting, and prompt bundles.
12. **Tools and MCP** - let Assistants invoke functions, connect to MCP servers, and
    use web search as a tool.
13. **Skills runtime** - load model-agnostic Skill packages with packaged
    instructions and resources.
14. **Retrieval and knowledge bases** - ground Assistants in user-provided document
    collections.
15. **Voice interaction** - add speech-to-text input and text-to-speech output while
    retaining the accessibility contract.
16. **Advanced generation** - support image output and side-by-side Model comparisons.
17. **Hardening and optional desktop wrapper** - improve operational resilience and
    evaluate a more integrated desktop experience.

## Data model

### Conversation

- `id` (string) - stable local identifier for a persisted conversation.
- `owner` (string) - local owner scope.
- `messages` (message array) - ordered transcript and message metadata.
- `title` (string) - user-visible conversation title.
- `revision` (integer) - optimistic-concurrency token for writes.
- `pinned` (boolean) - whether the conversation is prioritized in management views.
- `modelOverride` (string or null) - optional per-conversation Model selection.
- `reasoningOverride` (string or null) - optional per-conversation reasoning setting.

A Conversation belongs to one owner scope. A branch creates a new Conversation
from an existing transcript; it retains its own metadata and revision token.

### Settings

- `owner` (string) - local owner scope.
- `selectedModelId` (string or null) - default Model selection.
- `accessibilityPreferences` (configuration) - announcement, focus, keyboard, and
  display preferences.
- `generationPreferences` (configuration) - global generation defaults.
- `activeConversationId` (string or null) - persisted conversation restored as active.

Settings belong to one owner scope and reference Provider connections and their
available Models.

### Provider connection

- `id` (string) - stable connection identifier.
- `owner` (string) - local owner scope.
- `providerType` (string) - cloud Provider or compatible local-server type.
- `publicConfiguration` (configuration) - connection settings safe to return to the
  client.
- `secret` (separate protected value) - credentials excluded from normal responses
  and logs.

A Provider connection belongs to an owner scope and supplies the Models available
to that owner.

### Model metadata

- `modelId` (string) - namespaced identity of a Model available through a connection.
- `connectionId` (string) - Provider connection that can call the Model.
- `enrichment` (metadata) - discovered model details.
- `offlineSnapshot` (cached metadata) - local fallback for model details when live
  discovery is unavailable.

Model metadata belongs to a Provider connection and is used for Model selection
and generation configuration.

### Diagnostic log entry

- `timestamp` (datetime) - time the event was recorded.
- `category` (string) - Server or client diagnostic category.
- `level` (string) - content-safe outcome severity.
- `eventData` (structured data) - non-secret, non-prompt diagnostic details.

Diagnostic log entries belong to local runtime data. They must never contain API
keys or message content unless explicit development content logging is enabled.

## Tech stack

- **Bun and strict TypeScript** - workspace runtime, development tooling, and
  standalone compilation.
- **`packages/shared` with Zod** - typed Contract and trust-boundary schemas.
- **Hono** - versioned Server routes.
- **AI SDK Provider integrations** - model orchestration.
- **Drizzle with Bun SQLite** - local persistence for owner-scoped data.
- **LogTape** - content-safe structured diagnostics.
- **Vite and React 19** - thin web client.
- **TanStack Router, TanStack Query, and Zustand** - routing, server-state queries,
  and local client state.
- **Tailwind CSS v4, shadcn/ui, and Streamdown** - component styling and streamed
  response rendering.
- **Vitest, Bun test, Playwright, axe, oxlint, oxfmt, markdownlint, and Lefthook** -
  verification and code quality tooling.

## Monetization

> TODO (confirm): Pricing, licensing, and monetization are not decided.

## UI/UX

Accessibility is the primary product requirement. The client must meet WCAG 2.2 AA,
support complete keyboard operation, use semantic structure, preserve predictable
focus, and announce status through the dedicated notification system rather than the
visual streamed-text container.

> TODO (confirm): The plans do not specify routes or screen inventory beyond the
> accessible AI interaction requirements.

## Deployment

Anvika is local-first. A Bun Server serves the built web client, and a Windows
launcher plus standalone compiled binary support distribution. Local runtime data,
SQLite storage, and logs live under the configured data directory.

- Web build: `bun run build:web`
- Local serve: `bun run serve`
- Standalone build: `bun run build`

> TODO (confirm): If hosted deployment is in scope, record the provider, domain,
> environment variables, health check, and operational requirements in
> `project-plan.md`.

## Open questions

- **Named bugs** - add the existing-bug outcomes before item 8 is specified.
- **Enhancements** - add concrete outcomes before item 9 is specified.
- **Roadmap order** - reprioritize items 10 through 17 after stabilization work.
- **Business and hosting** - decide monetization, licensing, and hosted-deployment
  scope.

No contradictions were found between the project plan and build plan.
