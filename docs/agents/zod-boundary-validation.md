# Strict trust-boundary validation (Zod) checklist

Standing requirement (owner directive). Every trust boundary in the app is strictly Zod-validated,
in BOTH directions, as code is written. Following this on every change keeps the boundary surface
clean so the whole-app audit stays small rather than chasing a moving target.

This complements, and does not replace, "Zod only at trust boundaries" (ADR/AGENTS): internal
calls between already-typed code are NOT validated at runtime; TypeScript covers those. The rule
here is about the EDGES of the app.

The point-in-time map of every boundary and the schema guarding it is
`docs/agents/zod-boundary-inventory.md` (the closing artifact for the whole-app audit). Keep it
current when you add or change a boundary.

## What counts as a trust boundary

Validate every place untrusted or persisted data crosses into typed code:

- API request bodies (inbound) AND successful response bodies (outbound). Validate outputs; do not
  cast a response with `as`.
- Route params and query strings.
- DB JSON columns read back from SQLite (conversation messages and metadata, settings JSON, any
  per-conversation state, migration registry data).
- File reads (config files, data-dir contents).
- Client-to-server payloads and server-to-client payloads (the typed API contract), validated on
  both ends.
- Settings GET/PATCH (including the merge layer), the models endpoint, the chat endpoint.
- SDK passthroughs that carry untyped data, for example AI SDK `safeValidateUIMessages` with an
  explicit `metadataSchema` (without it, message metadata passes through unvalidated, which is the
  exact gap that motivated the audit).
- Anywhere a value enters typed code via `as`, `JSON.parse`, or an un-validated SDK passthrough.

## How to validate

- Use a Zod schema at each boundary; prefer strict object schemas (`z.strictObject`) so unknown
  keys are rejected rather than silently carried.
- Validate in BOTH directions where data crosses both ways (request and response; write and
  read-back).
- On malformed input: reject with the API error contract (`{ code, message, details }`, HTTP 400)
  for live requests; for disposable, single-user PERSISTED data that may be schema-evolved or
  legacy, fail soft to a safe empty or default value rather than crashing (acceptable for this data).
- Never cast across a boundary with `as`, and never trust a bare `JSON.parse` result: parse THEN
  validate.
- Keep schemas in `packages/shared` where they are the shared contract; import the inferred type
  rather than re-declaring it.

## Per-change checklist (run before opening a PR)

- For every NEW boundary the change introduces, a Zod schema guards it in both directions.
- No new `as`-cast, bare `JSON.parse`, or un-validated SDK passthrough at a boundary.
- A test proves malformed input at each new boundary fails safely (HTTP 400 or fail-soft).
- Internal (non-boundary) calls were NOT given blanket runtime validation.
- The boundary and its schema are recorded in `docs/agents/zod-boundary-inventory.md`.

## Why this is a standing practice

The whole-app audit exists to close existing boundary gaps. If every change validates its own
new boundaries as it lands, no new debt accrues, so the audit shrinks to closing the pre-existing
gaps instead of a target that keeps growing. Strict, both-direction validation is a hard
requirement for every future change, not a one-off audit.
