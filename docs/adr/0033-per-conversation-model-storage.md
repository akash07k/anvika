# Per-conversation model override is a dedicated nullable column, not a JSON blob

**Status:** Accepted
**Date:** 2026-06-22

Each conversation can carry its own model, independent of the global
`settings.selectedModelId` set by the user. The rich model picker delivers
a per-conversation model override that the server resolves on every
turn.

## Context

The reasoning override established the per-conversation column pattern end to end: a
nullable column on `conversationTable`, a dedicated `PATCH` route
(`/api/v1/conversations/:id/reasoning`), an optimistic client writer, and a server-side
resolution step that falls back to the global setting when the column is null. The model
override is the same class of value: a single first-class string resolved on every turn
(`modelId || settings.selectedModelId` in `apps/server/src/chat/resolve-model.ts`) and
gated by chat readiness (ADR 0021), exactly like `reasoningOverride`.

Two design questions arose during planning:

1. Should the model share a JSON `generation_settings` column with future numeric
   parameters (temperature, top-p, etc.), or get its own dedicated column?
2. Where should future numeric generation parameters live?

## Decision

The per-conversation model override is stored as a **dedicated nullable `model_id` column**
on `conversationTable`, mirroring `reasoning_override`. It is NOT folded into a JSON blob.

Future numeric generation parameters (temperature, top-p, top-k, max output tokens,
presence/frequency penalties) are **explicitly deferred** and, when added, will live in a
**separate JSON `generation_settings` column** - a single additive migration, no
per-parameter column churn.

## Considered Options

- **Dedicated nullable `model_id` column (chosen):** mirrors `reasoning_override` exactly.
  The model is a single hot string used in per-turn resolution and chat-readiness gating;
  it benefits from being a plain indexable value and from reusing the reasoning precedent,
  which is already proven and low-risk. The pattern (column, PATCH route, optimistic writer,
  null-fallback) ships in one additive migration with zero structural novelty.

- **JSON `generation_settings` column holding model plus future numeric params (rejected for
  the model):** a natural fit for the numeric parameters that will follow, but the wrong home
  for the model itself. The model is not a generation tuning knob - it is a routing and
  readiness value that drives resolution before any generation parameter is consulted. Burying
  it in a blob gives up indexability, makes the null-fallback logic less obvious, and gains
  nothing over the proven column pattern. Numeric parameters will land in this column when
  they ship.

- **No per-conversation override - use `settings.selectedModelId` only (rejected):** the
  goal of the rich model picker is precisely to let each conversation carry its
  own model. This option would not deliver that goal.

## Consequences

- One additive nullable `model_id TEXT` column lands on `conversationTable` in a new
  drizzle-kit migration.
- The override route, client store, and optimistic writer mirror the `reasoning_override`
  precedent exactly, so the implementation carries no structural novelty.
- `null` means inherit the global `settings.selectedModelId`; an explicit value wins for
  that conversation only and is content-safe metadata (connection:model), safe to log.
- Future numeric generation parameters (temperature, top-p, top-k, max output tokens,
  presence/frequency penalties) slot into a `generation_settings` JSON column added in one
  future migration, with no per-field column churn and no change to the model column.
- The `revision` token (ADR 0030) is NOT bumped by a model-override write, consistent with
  how reasoning-override writes are handled - only `saveTurn` advances `revision`.
