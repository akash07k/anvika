# Multi-conversation persistence is id-keyed and owner-scoped, with client-minted ids, lazy creation, per-conversation URLs, and revision-based optimistic concurrency

A single-conversation-per-owner design would key `conversation` by `owner` as its primary key,
holding the message transcript, a reasoning override, and a timestamp. Multi-conversation
management instead models a managed list of many - create, switch, rename, and
delete - and several forces shape the data model at once. Each
conversation must live at its own URL (`/c/:id`) so deep links, browser back/forward, and "open in
new tab" all work; a new conversation is created LAZILY (a draft has no server row until its first
turn); the chat response STREAMS, so there is no clean channel to hand a server-minted id back
mid-stream; and multiple browser tabs (or a future mobile or CLI client, per the API-first charter,
ADR 0001) can write the same conversation and must not silently clobber each other.

Those forces interact. Per-conversation URLs need the id the instant a draft exists, before any
server round-trip; lazy creation means the row that the id keys does not yet exist; and streaming
removes the natural moment to assign a server id. So the identity, creation, routing, and
concurrency decisions are not independent - they reinforce one client-minted-id model.

The decision: conversation rows are id-keyed and owner-scoped, ids are CLIENT-MINTED short
`xxx-xxx` Crockford base32 values, rows are created lazily on the first turn (create-if-absent), the
last-active pointer lives in a separate `app_state` table, concurrency is governed by a per-row
`revision` token (the server returns a 409 `conflict` on a stale `baseRevision`). In the public
repository this id-keyed, owner-scoped shape ships as part of the single v1 baseline schema; there
is no historical single-row table to carry forward.

Rationale: client-minting is the standard offline-first pattern and the only clean fit for lazy
creation over a streaming response with per-conversation URLs - the client has the id before the
first byte leaves the browser, so the URL, the draft, and the eventual row all agree. Because the
single-owner client holds the COMPLETE set of existing ids, the uniqueness check is exhaustive and
deterministic rather than probabilistic, so a clash is impossible without paying for a UUID's
length (the short id is also far friendlier to read out by a screen reader). Keeping persistence
id-keyed and owner-scoped leaves the server the source of truth (ADR 0003) while letting any thin
client drive it identically.

## Considered Options

- **Client-minted short ids (chosen):** the client mints a `xxx-xxx` id via `mintConversationId`,
  re-rolling against the loaded conversation list until the candidate is free (an exhaustive,
  deterministic check for the single owner), and uses it immediately for the URL and the draft. The
  server validates the `xxx-xxx` format (`ConversationIdSchema`) at every boundary. Chosen because
  lazy creation, a streaming response, and
  per-conversation URLs all need the id before the first server round-trip; this reverses the earlier
  thin-client "clients never mint ids" default.
- **Server-minted ids, the thin-client default (rejected):** the server assigns the id on first
  persist and hands it back. Rejected because there is no clean channel to return a new id mid-stream,
  and the URL and draft would have no stable id until after the first turn - breaking deep-linking and
  the lazy draft. The exhaustive client-side uniqueness check removes the usual server-minting
  motivation (avoiding client id collisions).
- **Lazy row creation (chosen):** "New conversation" mints a client-side draft only; no server row
  exists until the first turn, when `saveTurn` upserts by `(owner, id)` and creates the row with a
  derived title. `GET /api/v1/conversations/:id` returns 404 for a draft, which the client models as a
  null detail (an expected empty state, not an error), proving the draft has no row. Chosen to keep
  empty drafts free of persistence and the list free of phantom rows. (The single deliberate exception
  is a draft whose per-conversation reasoning override is changed before its first send: that eagerly
  creates an empty-messages row so the very first turn honors the override, since the server resolves
  the override from the store, ADR 0029.)
- **Eager row creation on "New conversation" (rejected):** create the row the moment the user asks
  for a new conversation. Rejected because it litters the list and the database with empty rows the
  user never sends to, and it forces a server round-trip before the user has done anything.
- **A separate `app_state` pointer table (chosen):** the last-active conversation id lives in its own
  `app_state` table keyed by `owner`, read by the `ActiveConversationStore` port. Chosen because the
  active pointer is SESSION state, not a property of any one conversation row and not a user
  preference - so it belongs neither on a conversation row nor in the schema-versioned settings JSON
  (where it would wrongly surface in the Settings form). Keeping it separate is single-responsibility,
  and the read is defensive (`resolveActiveId` falls back to the most-recent conversation when the
  pointer dangles).
- **A single active-pointer column on a conversation row (rejected):** mark the active conversation
  with a boolean or a self-referential column on `conversation`. Rejected because "which conversation
  is active" is a per-owner singleton, not a per-row fact; modeling it per-row invites two rows
  claiming active and couples session state to conversation rows.
- **Revision-based optimistic concurrency (chosen):** a monotonic `revision` integer per row, bumped
  ONLY by a message write (`saveTurn`), rides the conversation summary so the client always holds a
  fresh `baseRevision` without refetching the heavy messages. The client sends `baseRevision` on every
  chat send; a cheap pre-flight compares it to the stored revision and returns a 409 `conflict` BEFORE
  streaming (so a whole response is never streamed then discarded), and the conditional `saveTurn`
  reports a conflict if the row moved during the stream. Chosen because it protects ALL clients,
  including a non-browser one, which a browser-local dirty flag cannot. Bumping `revision` only on a
  message write means renaming or changing the thinking effort never stales a client's `baseRevision`.
- **Last-write-wins (rejected):** let the latest `saveTurn` win unconditionally. Rejected because two
  writers (two tabs, or a tab and a mobile client) would silently clobber each other's history, which
  is the exact correctness floor the API-first charter requires for any client.
- **Ships in the baseline schema (chosen):** in the public repository the id-keyed, owner-scoped
  `conversation` table and the `app_state` pointer table are part of the single v1 baseline schema;
  there is no historical migration or one-time startup backfill, because there is no prior
  single-row table to convert. The id and title remain application logic the client mints (a
  collision-free `xxx-xxx` id checked exhaustively against the loaded list, and a word-boundary
  title derived from the first user message) rather than SQL, so the server validates them at every
  boundary instead of computing them in a data migration.

## Consequences

- The contract gains conversation routes and fields, each validated in BOTH directions with strict
  Zod schemas plus malformed-input and unknown-id tests (the standing boundary-validation discipline): the
  conversation list and detail responses, the rename, delete, batch-delete, retitle, reasoning, and
  active-pointer endpoints, and two new optional fields on the non-strict chat envelope -
  `conversationId` (a short `xxx-xxx` id) and `baseRevision` (a non-negative integer).
- `ConversationIdSchema` is the shared id contract: a `xxx-xxx` value, two groups of three Crockford
  base32 lowercase characters (`0-9` and `a-z` minus `i`, `l`, `o`, `u`) joined by a hyphen. The
  hyphen is part of the canonical id - it is stored in the database and appears in the URL. The
  client mints it (with an exhaustive uniqueness check); the server validates it at every boundary.
- The `conversation` row is id-keyed and owner-scoped with a non-unique owner index, carrying
  `revision`, `created_at`, and `updated_at` alongside the messages, title, and reasoning override.
  `revision` and `updatedAt` advance only on `saveTurn`; rename and reasoning-override writes touch
  neither, so they never stale the concurrency token.
- A new `app_state` table holds the per-owner last-active pointer, read through the
  `ActiveConversationStore` port and resolved defensively at root entry, so a dangling pointer
  self-heals to the most-recent conversation rather than breaking the entry path.
- A stale `baseRevision` is surfaced content-safely: the server returns the standard
  `{ code, message, details? }` error contract at HTTP 409 with `code: 'conflict'` (the conflict
  response omits `details`), never echoing message text, and the
  client surfaces it through the typed notification layer (ADR 0013) at assertive priority, asking the
  user to resend without clearing the composer.
- Cross-tab consistency is built on the same `revision` token: a same-browser BroadcastChannel keeps
  the common case smooth (the UX floor) while the server-side `revision` check is the correctness
  floor that also covers non-browser clients; the live cross-tab message-transcript sync
  rides the same per-turn revision so an idle tab refreshes silently.
- Deferred: live message-stream MIRRORING across tabs, presence, and conflict merging (each tab
  streams its own turns). A forward pointer: per-conversation model id and generation parameters
  become per-conversation columns reusing this same id-keyed, owner-scoped cascade when the rich model
  picker and generation parameters land.
