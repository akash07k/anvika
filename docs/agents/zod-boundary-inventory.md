# Trust boundary inventory

The documented inventory of every trust boundary in Anvika and the Zod schema (or purpose-built
validator) guarding it, in both directions. This is the closing artifact for the whole-app
strict-validation audit. The standing per-change rules live alongside it in
`docs/agents/zod-boundary-validation.md`; this file is the point-in-time map of what guards what.

Scope note: a trust boundary is where untrusted, persisted, or external data crosses into typed
code. Internal calls between already-typed code are NOT validated at runtime (TypeScript covers
those, per ADR 0007). Where a boundary is guarded by a purpose-built parser instead of a Zod schema
(the CLI/env parsers), that is called out explicitly; it still rejects malformed input with a clear
error and has a test.

## Server HTTP endpoints

Files: `apps/server/src/routes/`. Inbound bodies, params, and query strings are validated before
use; successful response bodies are validated on the way out too (the both-direction rule). Error
responses use the canonical `{ code, message, details }` contract (`makeApiError`). The four
settings-bearing responses share `buildSettingsResponse` (`apps/server/src/settings/settings-response.ts`),
which redacts then validates the envelope in one place so a secret cannot be returned un-redacted.

- POST `/api/v1/chat`
  - Inbound: `ChatRequestSchema` (shallow), then deep per-message validation via the AI SDK
    `safeValidateUIMessages` with `metadataSchema: MessageMetadataSchema`.
  - Outbound: an AI SDK UI-message stream (not a JSON envelope); the client validates the error
    path with `ApiErrorSchema`.
  - Malformed-input test: `routes/chat.test.ts`.
- GET `/api/v1/conversation`
  - Read-back: persisted messages validated via `safeValidateUIMessages` + `MessageMetadataSchema`;
    fails soft to an empty conversation on a corrupt row.
  - Outbound: `ConversationResponseSchema.parse(...)` on every return.
  - Tests: `routes/conversation.test.ts` (fail-soft on corrupt and on malformed usage metadata);
    `persistence/drizzle/persistence-integration.bun.test.ts` (a real corrupt SQLite row fails soft).
- PATCH `/api/v1/conversation/reasoning`
  - Inbound: `SetReasoningOverrideSchema` (strict; rejects unknown keys and `inherit`).
  - Outbound: `SetReasoningOverrideSchema.parse(...)`.
  - Test: `routes/conversation.test.ts`.
- GET `/api/v1/settings`
  - Outbound: `SettingsResponseSchema.parse(...)` over the redacted envelope; a leaked plaintext
    secret fails the parse rather than reaching the client.
  - Test: `routes/settings.test.ts`.
- PATCH `/api/v1/settings`
  - Inbound: `SettingsPatchSchema` (deliberately `looseObject`; the real guard is the post-merge
    `SettingsSchema` re-validation in the service layer).
  - Outbound: `SettingsResponseSchema.parse(...)`.
  - Test: `routes/settings.test.ts` (an invalid merged result returns `validation-error` and
    persists nothing).
- GET `/api/v1/models` and POST `/api/v1/models/refresh`
  - Outbound: `ModelsResponseSchema.parse(...)`.
  - Test: `routes/models.test.ts`.
- POST `/api/v1/connections/test`
  - Inbound: `TestConnectionRequestSchema`.
  - Outbound: `TestConnectionResponseSchema.parse(...)`.
  - Test: `routes/connections.test.ts`.
- PUT `/api/v1/connections/:id/secret`
  - Inbound: `ConnectionIdSchema` (route param) and `SetConnectionSecretSchema` (body).
  - Outbound: `SettingsResponseSchema.parse(...)` over the redacted envelope (the secret never
    crosses this boundary; a leak fails the parse).
  - Test: `routes/connections.test.ts`.
- POST `/api/v1/settings/fx-rate/refresh`
  - Outbound: `SettingsResponseSchema.parse(...)`.
  - Test: `routes/fx-rate.test.ts`.
- POST `/api/v1/log`
  - Inbound: `DiagnosticBatchSchema` (strict).
  - Outbound: `204 No Content` (no body).
  - Test: `routes/log.test.ts`.
- GET `/api/v1/health`
  - Outbound: `HealthResponseSchema.parse(...)`.
  - Test: `routes/health.test.ts`.

## Database and file persistence read-back

Files: `apps/server/src/persistence/`. Persisted data is disposable single-user state, so a
schema-evolved or legacy row fails soft to a safe default rather than crashing.

- `conversation.messages` (SQLite JSON column): validated at the conversation route via
  `safeValidateUIMessages` + `MessageMetadataSchema`; fails soft to empty. The persistence layer
  `load` returns it unvalidated by design and the route is the guard (documented at the call site).
  Tests: `routes/conversation.test.ts`, `persistence-integration.bun.test.ts`.
- `conversation.reasoning_override` (SQLite TEXT): `ReasoningEffortSchema.safeParse` on read; fails
  soft to `null` (inherit) for a NULL, legacy, or corrupt value, logging content-safe metadata only.
  Test: `drizzle-conversation-store.bun.test.ts`.
- `settings.json` envelope (file): `SettingsEnvelopeSchema` (`{ version: number, settings: unknown }`)
  validated on read; a malformed envelope surfaces as `SettingsReadError` (the service maps that to
  defaults with `recovered: true`). Test: `file-settings-store.bun.test.ts`.
- `settings` payload after migrations: `SettingsSchema.safeParse` in the service layer on read and
  again before every write; fails soft to defaults with `recovered: true` on read, rejects on write.
  Tests: `routes/settings.test.ts` and the settings service tests.
- `secrets.json` (file): recombined via `mergeSecrets`, which orphan-drops a secret with no
  referencing connection (the self-healing direction). Test: `file-settings-store.bun.test.ts`.
- Settings migration registry: pure transform functions over `unknown`; their output is validated by
  `SettingsSchema` after the chain runs (above). Test: `settings/migrations.test.ts`.

## Configuration, environment, and CLI

Files: `apps/server/src/config/`. CLI flags and `ANVIKA_*` environment variables are genuine trust
boundaries, each validated by a strict purpose-built parser (precedence: flag, then env, then
default) that rejects malformed input with an actionable error.

- `--port` / `ANVIKA_PORT`: `parsePort` (regex plus 1 to 65535 range). Test: `config/bootstrap.test.ts`.
- `--data-dir` / `ANVIKA_DATA_DIR`: `resolveDataDir` (precedence, directory creation, and a
  writability check that throws an actionable error). Test: `config/data-dir.test.ts` (includes the
  unwritable-directory path).
- `--log-level` / `ANVIKA_LOG_LEVEL`: `parseLevel` (enum). Test: `config/bootstrap.test.ts`.
- `--log-category` / `ANVIKA_LOG_CATEGORIES`: `parseCategories` (format plus level enum). Test:
  `config/bootstrap.test.ts`.
- `--log-content` / `ANVIKA_LOG_CONTENT`: `isEnvTrue` (strict boolean coercion). Test:
  `config/bootstrap.test.ts`.
- Static asset serving: a path-traversal guard (`candidate.startsWith(dist + sep)`) in
  `assets/filesystem-asset-source.ts`.
- Log retention sweep: only deletes directories matching a strict date pattern, ignoring per-entry
  failures (`logging/retention.ts`).

## Web client

Files: `apps/web/src/`. Every server response the client owns is validated with `safeParse` against
the shared schema before use; there is no client-side persisted or otherwise untrusted storage.

- `lib/api-client.ts` (`apiGet`/`apiPost`/`apiPatch`/`apiPut`): each response is `safeParse`d against
  the supplied response schema, throwing `ApiClientError('validation-error', ...)` on a mismatch;
  error bodies are validated with `ApiErrorSchema`. Test: `lib/api-client.test.ts` (malformed
  response).
- Response schemas used by the callers: `HealthResponseSchema`, `SettingsResponseSchema`,
  `ModelsResponseSchema`, `ConversationResponseSchema`, `SetReasoningOverrideSchema`,
  `TestConnectionResponseSchema`.
- `lib/api/chatFetch.ts`: streaming is owned by the AI SDK; the error path is validated with
  `ApiErrorSchema`. Test: `lib/api/chatFetch.test.ts`.
- `lib/conversation/conversationQueries.ts`: messages are typed as `UIMessage[]` via the documented shallow-schema
  plus AI-SDK-deep-validation pattern (mirrors the server's `ConversationResponseSchema`).

## SDK passthroughs

- `safeValidateUIMessages` is always called with `metadataSchema: MessageMetadataSchema` (in
  `routes/chat.ts` and `routes/conversation.ts`), so message metadata is validated rather than
  passed through unchecked. This is the exact gap (untyped metadata passthrough) that motivated the audit.
- Reasoning `providerOptions` are built internally from the capability rule tables, never from
  untrusted input, so the cast to the SDK option type is not a boundary.

## Intentional designs that are not gaps

- `z.array(z.unknown())` for `messages` in `ChatRequestSchema` and `ConversationResponseSchema`:
  two-stage validation. The shallow array is validated here; the deep `UIMessage` shape is owned and
  validated by the AI SDK.
- `z.unknown()` for `ApiError.details` and the settings-envelope payload: deliberately opaque, each
  validated at the next layer (the latter by `SettingsSchema`).
- `SettingsPatchSchema = z.looseObject({})`: tightening it would strip unknown keys and make the
  deep merge silently no-op; the post-merge `SettingsSchema` re-validation is the real guard.
- `apps/server/src/build/embed-codegen.ts` reads the drizzle-kit journal at BUILD time. It is a
  build artifact produced by our own tooling, not a runtime trust boundary, so it is out of scope for
  the runtime validation rule.
