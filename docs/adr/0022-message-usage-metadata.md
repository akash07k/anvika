# ADR 0022: Message usage metadata

Usage and cost metadata for each completed assistant turn are recorded as a content-safe
`usage` block stamped at the AI SDK `finish-step` seam. The block rides the persisted
`UIMessage` JSON with no separate table or migration. A per-turn price snapshot stores the
input and output rates at generation time so that estimated cost is historically accurate
and render-independent.

## Context

The AI SDK reports normalized token counts (input, output, cache-read, cache-write
sub-counts) at the `finish-step` boundary. It never reports a cost figure; cost is
the application's responsibility to compute from a catalog of per-million-token USD rates.

Usage and cost information is content-safe: it contains only counts, enumerated identifiers,
and numeric rates - never any portion of the prompt or response text, never any API key or
secret. This puts it in the same category as the `chatReadinessResolved` diagnostic event
(ADR 0016) - metadata that is safe to persist, render, and log without risk of leaking
conversation content.

Two tensions shaped the design:

- The live price catalog may be updated or may not contain a retired model at render time.
  Cost computed at render time would therefore be wrong for historical turns or absent
  for models no longer in the catalog.
- A separate database table for usage would require a migration, a join on every
  conversation load, and a new persistence path - all for metadata that already has a
  natural home in the message record.

Provider metadata from the AI SDK (the raw `providerMetadata` field) is unbounded and
per-provider in shape. It can contain sub-fields whose content or structure is not under
our control, introducing an unpredictable surface for privacy and schema drift.

## Decision

A content-safe `usage` block is stamped onto each assistant `UIMessage` at the AI SDK
`finish-step` seam (in `apps/server/src/chat/stream-chat.ts`). The block is typed by
`UsageMetadataSchema` in `packages/shared/src/chat/message-metadata.ts`, composed into the
message-level `MessageMetadataSchema` as an optional `usage` field. That schema is the
typed contract for message metadata and is also the runtime validator at the trust
boundaries. It rides the persisted `UIMessage` JSON, and the metadata block is Zod-validated
at BOTH the inbound chat boundary (`apps/server/src/routes/chat.ts`) and the read boundary
(`apps/server/src/routes/conversation.ts`) by passing `MessageMetadataSchema` as the
`metadataSchema` to `safeValidateUIMessages`. A message whose metadata fails validation fails
soft: on read it yields an empty conversation with a content-free warning; on inbound it
returns a 4xx error. Validating in both directions matches the project rule of Zod at trust
boundaries (see Considered Options).

The `usage` block contains:

- SDK-normalized token sub-counts (input, output, and where the provider reports them:
  cache-read and cache-write tokens).
- The resolved namespaced `provider:model` identifier for the turn (for example
  `azure:my-deployment`).
- The AI SDK `finishReason` enum value.
- A price snapshot: the per-million-token USD input and output rates taken from the live
  catalog at the moment of generation, not at render time.

The price snapshot is `null` when no catalog entry exists for the resolved model (Azure
deployments and local openai-compatible models have no catalog price). The client renders
the token counts regardless and renders an estimated cost only when the snapshot is
non-null.

The `usage` block is written only for completed turns. Errored and aborted turns produced
no persisted assistant message originally, so they had no usage record. Robust handling of
partial-turn metadata was tracked for later. (AMENDED by ADR 0027: errored and
aborted turns now persist a marked partial assistant message; see that ADR for the
persist-but-don't-replay rule.)

The block is stamped during streaming at the `finish-step` part of the message-metadata
callback (not in a content chunk); `onFinish` then persists the already-stamped assistant
message.

## Considered Options

- **Separate usage or cost table** - rejected. A dedicated table requires a schema
  migration, a join on every conversation load, and a separate persistence write path.
  The metadata is small, turn-scoped, and already has a natural container in the message
  JSON record. Adding a table buys nothing except complexity.

- **Compute cost at render time from the live price list** - rejected. Rates change over
  time. A turn generated six months ago at one rate would display a cost computed at the
  current (different) rate, producing a historically inaccurate figure. A model retired
  from the catalog would show no cost at all even though it had one. Storing a price
  snapshot at generation time makes cost permanently accurate for the turn that incurred it.

- **Store raw `providerMetadata` from the AI SDK** - rejected. The `providerMetadata`
  field is unbounded and per-provider in schema. Its content is not under our control and
  may include fields that contain generated text, internal identifiers, or other values
  that cross the content-safety boundary. We capture only the SDK-normalized sub-counts,
  which are a small, well-defined set of integers.

- **Validate message metadata with Zod at the trust boundaries** - adopted.
  `MessageMetadataSchema` is passed as the `metadataSchema` to `safeValidateUIMessages` at both
  the inbound chat boundary and the conversation read boundary, so a malformed or schema-evolved
  metadata block fails validation rather than rendering. Because `createdAt` is required, a legacy
  row written before message metadata existed will fail validation and fail soft (an empty
  conversation on read, a 4xx on inbound). That is acceptable: the app is single-user with
  disposable local data, every live message carries `createdAt`, and strict validation at the
  boundary is the project rule (Zod at trust boundaries, in both directions).

## Consequences

- No database migration is required. Usage metadata is stored in the existing message
  JSON column that already persists `UIMessage` records.
- Only completed turns carry a `usage` block. Errored or aborted turns originally had no
  persisted assistant message and therefore no usage record. (AMENDED by ADR 0027: errored and aborted turns now persist a marked partial
  assistant message carrying a usage block with an `incompleteReason`; see that ADR.)
- Azure deployments and local openai-compatible models show token counts but no estimated
  cost, because neither has a catalog price. Cloud providers with catalog entries (Anthropic,
  OpenAI, Google, OpenRouter) show both.
- One content-safe block per turn: counts, identifiers, an enum, and rates. No prompt text,
  no response text, no API key, no secret ever crosses the usage persistence or log boundary.
- The resolved `provider:model` identifier is recorded per turn.
- Implementing files:
  - `packages/shared/src/chat/message-metadata.ts`
  - `apps/server/src/models/price.ts`
  - `apps/server/src/chat/usage-metadata.ts`
  - `apps/server/src/chat/resolve-model.ts`
  - `apps/server/src/chat/stream-chat.ts`
  - `apps/server/src/routes/chat.ts`
  - `apps/server/src/routes/conversation.ts`
  - `apps/web/src/lib/format/estimateCost.ts`
  - `apps/web/src/components/message/MessageUsageDetails.tsx`
  - `apps/web/src/components/message/MessageList.tsx`
