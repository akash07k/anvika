# Architecture

This document describes the shape of Anvika and the invariants that hold it together. It is
the map a new contributor reads before changing anything load-bearing. It states the rules and
the why; the mechanics and the footguns live in `docs/development.md`, which links back here.

For the project's vocabulary, see the glossary in `CONTEXT.md`. The terms in bold below
(Server, Provider, Connection, Model, model id, effective model) are defined there; we use them
verbatim and do not re-define them.

## What Anvika is (and is not)

Anvika is an accessible AI application for screen-reader and keyboard-only users - a Jan or
OpenWebUI class chat app. It is an orchestration layer over AI models: it connects to cloud
**Providers** and to the user's own already-running local server, and it does not run, host,
download, or serve models itself. Anvika orchestrates models (cloud providers and the user's
own local server) and does not run them; it is not an inference engine (ADR 0005). Running
models is a different product with a large platform-specific surface (packaging inference
engines, GPU drivers, weight management), and that surface is a permanent non-goal.

What Anvika does own is the accessible orchestration experience on top of models supplied by
others: the conversation, the streaming, the model layer, persistence, settings, and - above
all - the screen-reader and keyboard contract.

## The monorepo

Anvika is a Bun workspace with three packages plus tooling and end-to-end tests (ADR 0001). The
boundary between them is enforced by package structure, not convention, so the client-agnostic
contract the whole design rests on cannot quietly erode.

- `apps/server` (`@anvika/server`) is the running Hono process on Bun. It owns AI
  orchestration, persistence (Bun SQLite via Drizzle), the model registry, settings, and the
  HTTP routes under `/api/v1`. Throughout this document we call the conceptual API-first backend
  "the **Server**" (the glossary's canonical term); `apps/server` is the concrete process and
  package that embodies it, and "the backend" is fine when we mean the architectural layer in
  contrast to the client.
- `apps/web` is the Vite/React single-page application - the first **Client** of the Server's
  contract. It is thin: it renders, it drives keyboard and announcement behavior, and it sends
  and reads typed requests. It holds no business logic that another client would have to
  re-implement.
- `packages/shared` (`@anvika/shared`) is the **Contract**: the Zod schemas and types of the
  HTTP API, authored once and depended on by both the Server and every client. No client reaches
  into the web app for a type; it depends on this package.
- `tooling/` holds scripts and the launcher (the `serve` command, the standalone-binary
  pipeline). `tests/e2e/` holds the Playwright end-to-end suite.

## The Server is the heart

Anvika is API-first: the Server is the product, and the web SPA is only its first client (a
mobile or CLI client may follow, ADR 0001). Every capability that is more than presentation
lives in the Server - the model registry, AI orchestration, persistence, settings - behind a
versioned, typed HTTP contract. Clients stay thin so that a second client behaves identically
without re-deriving any rule.

Two consequences of this charter recur throughout the codebase and are worth stating up front:

- The Server is the source of truth for persisted state. It is the sole writer of a
  conversation, and it writes exactly once at end of stream (ADR 0003): a completed turn upserts
  the full transcript, a provider or stream error preserves only the incoming user message (so
  the turn is retryable after reload, never restoring a half-written assistant reply), and a
  deliberate Stop writes nothing. Because the AI SDK's `onFinish` does not fire on abort while
  `onAbort` does, the Server distinguishes a deliberate Stop from an involuntary error and treats
  them differently.
- Resolution that depends on layered state happens server-side, so the client can stay thin. The
  client sends a **model id** and the Server resolves it; the client sets a per-conversation
  override and the Server resolves the cascade (see "Cross-cutting invariants"). The client never
  sees credentials and never re-implements a precedence rule.

## The contract

The HTTP contract is defined once as Zod schemas in `packages/shared` and reused by both sides.
The API is versioned under `/api/v1` (`/api/v1/chat`, `/api/v1/conversations`,
`/api/v1/settings`, `/api/v1/models`).

Trust-boundary validation runs in BOTH directions and is mandatory for every boundary: request
bodies, response bodies, route params and query strings, DB JSON read-back, file reads, and SDK
passthroughs. We use strict object schemas and never cast with `as` or trust an unvalidated
`JSON.parse` at a boundary. Live input that is malformed is rejected (HTTP 400); disposable
single-user persisted data fails soft to an empty or default value rather than crashing a
restore. This is the project's Zod-at-boundaries discipline (ADR 0007); it is scoped to trust
boundaries and is not blanket runtime validation on internal calls, which TypeScript already
covers. The full checklist is `docs/agents/zod-boundary-validation.md`.

A worked example of the both-directions rule is the chat boundary, which validates twice (see
"Data flow of a chat turn").

## Data flow of a chat turn

A chat turn travels from the client to a Provider and back, with the Server owning every
decision in between.

1. The client POSTs to `/api/v1/chat`. The body carries the `UIMessage[]` history and, when the
   turn targets a persisted conversation, a `conversationId` and a `baseRevision`.
2. The Server validates the request twice (`apps/server/src/routes/chat.ts`). First a shallow,
   non-strict shared envelope (`ChatRequestSchema` in `packages/shared/src/chat.ts`) that
   validates the outer fields and strips unknown keys - the AI SDK transport posts a richer
   envelope, so this layer is deliberately not strict. Then the deep `UIMessage` shape through the
   AI SDK's own `safeValidateUIMessages` with our `MessageMetadataSchema`. We never `as`-cast an
   SDK passthrough.
3. The Server runs a pre-flight optimistic-concurrency check (below) and resolves the turn's
   **effective model** and reasoning effort server-side, then hands the work to the single
   AI-SDK orchestration seam.
4. All AI-SDK streaming lives behind one module, `streamChat`, the only place that calls `streamText`
   and the result's `toUIMessageStreamResponse` (ADR 0009). It exposes only domain types outward -
   the conversation as `UIMessage[]` and a `ChatTurnOutcome` it maps the SDK's finish signals into.
   The save policy is a separate pure module wired in as an injected `onTurnFinish` callback; the
   route itself calls no AI-SDK method.
5. The Provider streams back. The Server streams the UI message stream to the client and, at the
   terminal callback, persists per the policy in ADR 0003. Persistence is Bun SQLite through
   Drizzle (ADR 0003); a conversation is stored as the AI SDK `UIMessage[]` in a single JSON
   column, owner-scoped.

The Provider is reached through the **provider registry**, which maps a model id to a real,
callable AI SDK model. The registry is built fresh per request from the **Connections** the
owner has configured, so a just-saved credential takes effect with no restart.

## Cross-cutting invariants

These are the rules that span modules. Breaking one tends to break something far away, so each
is stated here as a rule, with the file that enforces it.

### The model-id namespace

A **model id** is `connectionId:model`, split on the FIRST colon only
(`parseModelId`, `apps/server/src/models/connection-type.ts`). Splitting on the first colon is
load-bearing because a provider's own model name may contain colons or slashes (for example
`openrouter:anthropic/claude-3.5-sonnet` keeps its slash). The prefix is a **Connection** id, not
a Provider name: it selects the connection, and so the endpoint and credentials. Two hard rules
follow:

- Never infer a Provider type by parsing a model-id prefix. The one sanctioned place that maps a
  connection id to a Provider type is `connectionTypeFor` (same file), which reads it from
  settings. Everything that needs a Provider type (price lookup, capability gating, logging) goes
  through there.
- The connection id is effectively immutable, because it is that prefix. Changing it would orphan
  the owner's selected model and every persisted usage record that named the old id.

### The server-resolved override cascade

A per-conversation value resolves server-side as highest-wins of per-conversation, else
per-connection, else global default. Reasoning effort is the established instance of this pattern
(ADR 0029): `resolveReasoning` (`apps/server/src/chat/resolve-reasoning.ts`) takes
`conversationOverride ?? fromConnection ?? settings.reasoningEffort`, then gates the result by the
model's capability registry so an unknown or non-reasoning model never receives options that could
error the turn. The per-conversation model override follows the same shape (ADR 0033):
`modelId || settings.selectedModelId` in `apps/server/src/chat/resolve-model.ts`, yielding the
**effective model**.

Resolving the cascade in the Server is the thin-client charter in practice: the client sets an
override and sends nothing extra on the chat request, and the DB is the source of truth, so an
override set in another tab still selects the right model and effort.

### Revision-based optimistic concurrency

Multiple clients (two browser tabs, or a future mobile or CLI client) can write the same
conversation, so a `revision` token guards every conversation row (ADR 0030). The key invariant is
WHAT bumps it: `revision` (and `updated_at`) advances ONLY on a message write - `saveTurn` in
`apps/server/src/persistence/drizzle/drizzle-conversation-write.ts`. A rename, a pin, a
reasoning-override write, a model-override write, and a heal-on-read of a partial transcript
(`healMessages`) each touch their own column and deliberately leave `revision` untouched. So those
operations never stale a client's `baseRevision` nor cause a spurious conflict.

The client sends its last-read `baseRevision` on each send; a cheap pre-flight compares it to the
stored revision and returns HTTP 409 BEFORE streaming, so a whole response is never streamed and
then discarded. This protects every client, including a non-browser one that a browser-local dirty
flag could not.

### Membership versus enrichment, with an offline floor

The available-model list separates two concerns (ADR 0023). MEMBERSHIP - which models a
Connection can actually call - comes from live per-type discovery adapters
(`apps/server/src/models/discovery/`) that call each Provider's own model-listing endpoint.
METADATA - price, context window, max output - comes from a separate layered enrichment lookup
(`apps/server/src/models/enrichment/`): the live listing's own metadata first (per non-null
field), then a cached `models.dev` fetch, then a committed snapshot, then null.

Two properties matter here. Every discovery adapter is fail-soft, so a bad key, a network
blip, or a malformed body contributes no models rather than erroring `GET /api/v1/models`; the
endpoint never 500s on a Provider outage. And the committed snapshot is the offline floor, so the
chat finish seam can always price a turn synchronously and a brand-new model still appears (just
without price or context) until enrichment catches up.

### Reasoning replay sanitization

Anvika replays the full conversation history every turn - it is stateless and carries no
`previousResponseId`. Persisted reasoning artifacts would break the NEXT request, so the
model-facing replay copy is sanitized in two passes, and only the replay copy - the
persisted and displayed history is untouched:

- Reasoning parts are pruned from the replay with the AI SDK's own `pruneMessages({ reasoning:
  'all' })` (`pruneReasoningForReplay`, `apps/server/src/chat/replay-sanitization.ts`). Reasoning is a
  model output, never a required input.
- Pruning reasoning alone is insufficient. The OpenAI Responses Provider also stamps an `itemId`
  on assistant TEXT parts, which becomes a dangling `item_reference` on a model switch. A separate
  `stripItemReferences` pass (`apps/server/src/chat/replay-sanitization.ts`) removes every
  `providerMetadata.*.itemId` from the replay copy, leaving other provider options intact. Both
  passes are content-safe (they read part `type` and metadata keys, never message text).

## Accessibility architecture

Anvika targets screen-reader and keyboard users specifically (not low-vision or high-contrast
users; there is a single visual theme and no theme switcher). The accessibility model is the most
load-bearing part of the design, and it rests on a deliberate separation of the visual stream from
the spoken stream.

The two-channel streaming model is the core idea. Streamed text flows to a visual container that
is NOT a live region; the live information a screen-reader user hears comes only from the announce
utility, never from the streaming container. A finished message becomes a focusable region whose
accessible name is a SHORT role label ("You", "Assistant"), never the full message content -
naming a region with its whole content would flatten its headings, lists, and code into one
unreadable string. Concretely, each message is an `<h2 tabIndex={-1}>` heading
(`apps/web/src/components/message/MessageRow.tsx`) so focus-on-completion and the quick-nav jumps
can target it, and the message's body, reasoning, and copy controls follow under it.

Two ARIA choices are deliberately the absence of a role:

- The conversation is a plain labelled `<ol>` marked `aria-busy` while a response generates - NOT
  `role="log"` (`apps/web/src/components/message/MessageList.tsx`). A log is an implicit live region; it
  would read streamed tokens and each new message aloud, fighting the deterministic announce model.
- The visual error is a focusable, non-live element - NOT `role="alert"`
  (`apps/web/src/components/ChatErrorRegion.tsx`, ADR 0015). The error is announced once through
  the notification layer; a `role="alert"` would double-speak the single announcement.

All spoken status passes through one announce utility (`announce(message, priority)`), which
prefers the `ariaNotify` web API and falls back to a visually-hidden aria-live region. During
generation it drives the heartbeat: "Generating response" at the start, a changing "Generating, N
seconds" at a configurable interval, and a completion or stopped line at the end. A changing
elapsed-time string re-announces cleanly in the aria-live fallback and dodges the
identical-message problem. Navigation is keyboard-first: headings per message for heading-by-heading
movement, and quick navigation addressing the last ten messages by index (`Alt+1` most recent
through `Alt+0`), a single press announcing the message's descriptor and a double press moving
focus to it.

The keyboard and announcement contracts, the support matrix, and the manual screen-reader test
plan live under `docs/accessibility/`.

## Where to go next

- `docs/adr/` - the Architecture Decision Records behind every rule above, including the
  orchestrate-not-run charter (ADR 0005), the API-first monorepo (ADR 0001), server-owned
  persistence (ADR 0003), the model layer (ADR 0004), the orchestration seam (ADR 0009), the
  multi-conversation data model (ADR 0030), and live discovery and enrichment (ADR 0023).
- `CONTEXT.md` - the glossary; the source of truth for the project's vocabulary.
- `docs/development.md` - working in the code: the mechanics and footguns behind these
  invariants.
- `docs/testing.md` - the testing strategy and the project split.
- `docs/build.md` and `docs/release.md` - the build and the standalone-binary pipeline.
