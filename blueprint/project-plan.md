# Project Plan

## 1. Problem - What problem are we solving?

Screen-reader and keyboard-only users need an AI application they can operate
reliably without visual-only controls, noisy streaming announcements, or inaccessible
navigation. Anvika provides that accessible orchestration layer over cloud Providers
and an already-running local server. It deliberately does not run, host, download, or
manage AI models itself.

## 2. Users - Who is this for?

- Screen-reader users who need predictable, keyboard-first AI interactions.
- Keyboard-only users who need complete non-pointer navigation.
- Local-first users who want to connect their own Provider accounts or local model
  server without giving Anvika responsibility for model hosting.

## 3. Features - What does the MVP need?

### Available today

- An API-first, versioned Server and shared typed Contract.
- Accessible streamed chat with deterministic screen-reader announcements and keyboard
  navigation.
- Cloud and local Provider connections, model discovery, model selection, and
  reasoning controls.
- Persisted multi-conversation management, including active conversations, renaming,
  pinning, branching, and deletion.
- Local diagnostics, content-safe logging, health checks, and a standalone binary
  build.

### Planned next

- Modernize project dependencies before feature work resumes.
- Repair known existing bugs after the dependency upgrade, then address migration
  regressions and enhancements to existing behavior.
- Continue the accessible AI workspace roadmap with attachments, Assistants, tools and
  MCP, Skills, retrieval, voice, advanced generation, and hardening.

## 4. Data - What are we storing?

- Owner-scoped conversation transcripts, metadata, titles, overrides, and revision
  tokens in local SQLite storage.
- User settings and Provider connection configuration. Secrets are stored separately
  and redacted from normal responses and logs.
- Model discovery and enrichment metadata, including the offline snapshot/cache used
  for model details.
- Content-safe diagnostic log entries and local runtime data.

## 5. Tech - What stack are we using?

- Bun workspace and Bun runtime with strict TypeScript.
- `packages/shared` for Zod schemas and Contract types.
- Hono Server, AI SDK Provider integrations, Drizzle over Bun SQLite, Zod, and
  LogTape.
- Vite and React 19 web client with TanStack Router, TanStack Query, Zustand,
  Tailwind CSS v4, shadcn/ui, and Streamdown.
- Vitest, Bun test, Playwright, axe, oxlint, oxfmt, markdownlint, and Lefthook.

## 6. Monetize - How will this make money?

> TODO (confirm): No pricing, licensing, or monetization model is documented yet.

## 7. UI/UX - How should this look and feel?

Accessibility is the primary product requirement, not a final polish step. The web
client must meet WCAG 2.2 AA and support complete keyboard operation, semantic
structure, predictable focus management, and concise screen-reader announcements.
Streaming text is visual content; spoken status is delivered through the dedicated
notification system so it does not overwhelm users.

## 8. Deployment - Where and how will this ship?

Anvika is local-first. It runs as a Bun Server that serves the built web client, with
a Windows launcher and a standalone compiled binary for distribution. Local runtime
data, SQLite storage, and logs live under the configured data directory.

> TODO (confirm): Decide whether a hosted deployment is also in scope and, if so,
> record the provider, domain, environment variables, and operational requirements.
