# Model catalog and discovery

> Note: superseded by ADR 0023 (live model discovery and enrichment). This note describes the retired
> static-catalog design - model membership came from hand-maintained rows in
> `apps/server/src/models/catalog/<provider>.ts`, merged with live discovery for OpenRouter and the
> local server. That static catalog is deleted. Membership now comes from live per-type discovery in
> `apps/server/src/models/discovery/` (one adapter per provider type), and metadata and pricing from
> the enrichment layer in `apps/server/src/models/enrichment/` (a cached models.dev fetch over the
> committed `enrichment/snapshot.json` floor, regenerated via `tooling/refresh-models-snapshot.ts`).
> Kept for the historical design rationale.

Date: 2026-06-07

How Anvika builds the available-model list returned by `GET /api/v1/models`. This note
captures the catalog source and refresh path, the raw row shape and its units, the merge
rule, the live-discovery payload shapes verified against the real
providers, and the provider packages with their factory signatures. See ADR 0004
(provider-agnostic model layer, amended 2026-06-07 to add xAI) and ADR 0012 (model catalog
source) for the decisions behind this.

## Source and refresh

The static catalog is seeded from models.dev. To refresh it:

- Fetch the upstream data: `curl -s https://models.dev/api.json`.
- Re-derive the per-provider rows from that payload.
- Edit the raw arrays in `apps/server/src/models/catalog/<provider>.ts` (one file per
  provider: `anthropic.ts`, `openai.ts`, `google.ts`, `xai.ts`, `openrouter.ts`).

A refresh is a data edit, not a code change: the row shape and the composition logic in
`catalog/index.ts` stay the same; only the row values move. The catalog is the metadata
authority and the offline floor because a bare provider `/models` endpoint
returns ids without display names, context windows, or prices.

## The raw row shape

Each file exports an array of `RawModelRow` (defined in `catalog/index.ts`). The fields and
their units:

- `model`: the provider-native model id, with no namespace prefix (for example
  `claude-sonnet-4.5`, not `anthropic:claude-sonnet-4.5`). The namespace is added during
  composition.
- `displayName`: the human-facing name shown in the picker.
- `contextWindow`: the context window in tokens, or null when unknown.
- `maxOutputTokens`: the maximum output tokens, or null when unknown.
- `inputPrice`: input price in USD per MILLION tokens, or null when unknown.
- `outputPrice`: output price in USD per MILLION tokens, or null when unknown.

Composition (`toModelInfo`) namespaces the id as `${providerId}:${row.model}`, stamps the
baseline text capability `{ text: true }`, and passes the metadata fields through unchanged.

## The merge rule

`assembleAvailableModels` in `apps/server/src/models/service.ts` builds the final list from
settings. Each provider contributes only when it is configured:

- Static cloud providers (anthropic, openai, google, xai): the static catalog rows are
  pushed in, gated on that provider's `apiKey`.
- Azure: no static rows exist. A single entry is synthesised from the configured deployment
  name (the deployment IS the model id) as `azure:<deployment>`, gated on apiKey plus
  resourceName plus deployment. Its metadata fields are null.
- OpenRouter: the static rows are a small fallback FLOOR. When the key is set, the live
  list from `GET https://openrouter.ai/api/v1/models` is fetched and merged so that a live
  model supersedes a static one on id collision (union by id, live wins). On any fetch
  failure the live list is empty, so the static floor stands alone.
- Local: live-discovery only, no static rows, from `GET {baseUrl}/models`, gated on a
  non-empty `localBaseUrl`.

After assembly, every record is re-validated against `ModelInfoSchema` with `safeParse`,
and any record that fails is dropped. This means one malformed live model (for example a
non-positive context window) is removed rather than carried forward, so a single bad
external record can never make the `/models` route's response-parse throw. Discovery itself
also returns an empty list on any failure, so the endpoint degrades gracefully and never
throws.

## Live discovery shapes (verified 2026-06-06)

Discovery lives in `apps/server/src/models/discovery.ts`. Both fetches use an abort timeout
(default 2000 ms) and return an empty list on any error or non-200.

Local server (`fetchLocalModels`):

- Request: `GET {baseUrl}/models`.
- Response: `{ object: 'list', data: [{ id }] }`.
- Mapping: use `data[].id` for both the namespaced id (`local:<id>`) and the displayName.
  Price and context fields are null (the local server does not report them).

OpenRouter (`fetchOpenRouterModels`):

- Request: `GET https://openrouter.ai/api/v1/models` with header
  `Authorization: Bearer <key>`.
- Response: `data[]` whose entries carry `id`, `name`, `context_length`,
  `pricing.prompt` and `pricing.completion`, `top_provider.context_length` and
  `top_provider.max_completion_tokens`, and `architecture.output_modalities`.
- `pricing.prompt` and `pricing.completion` are STRINGS in USD per token. Multiply by
  1,000,000 to get USD per million; the result is null when the value is missing or NaN.
- `contextWindow` uses `context_length`, falling back to `top_provider.context_length`,
  then null.
- `maxOutputTokens` uses `top_provider.max_completion_tokens`, else null.
- `architecture.output_modalities` is used to drop models that cannot output text
  on the modality list. A model is kept when the modality list includes `text`, or when the
  field is absent or not an array (so a payload-shape change never over-filters the list).

## Provider packages

The registry (`apps/server/src/models/registry.ts`) constructs AI SDK providers per request
from validated plaintext settings, registering only the configured ones. The packages and
the factory signatures used:

- `@ai-sdk/openai` (^3.0.68): `createOpenAI({ apiKey })`.
- `@ai-sdk/anthropic` (^3.0.81): `createAnthropic({ apiKey })`.
- `@ai-sdk/google` (^3.0.80): `createGoogleGenerativeAI({ apiKey })`.
- `@ai-sdk/xai` (^3.0.93): `createXai({ apiKey })`.
- `@ai-sdk/openai-compatible` (^2.0.48): `createOpenAICompatible({ name, baseURL })`; both
  name and baseURL are required. Used for the local provider.
- `@openrouter/ai-sdk-provider` (^2.9.0): `createOpenRouter({ apiKey })`.
- `@ai-sdk/azure` (^3.0.70): `createAzure({ resourceName, apiKey })`; already present from
  the foundation work.

The registry is built with `createProviderRegistry(providers, { separator: ':' })`. The
separator splits on the FIRST colon only, so an OpenRouter id such as
`openrouter:anthropic/claude-sonnet-4.5` resolves to provider `openrouter` and model
`anthropic/claude-sonnet-4.5` with its slashes intact.

## Deferred: per-provider live discovery for cloud providers

Live `/models` discovery for the static cloud providers (anthropic, openai, google, xai) is
intentionally deferred for now. The static catalog is their only source. The
custom-model-id escape hatch in the settings picker covers the gap: any `provider:model` id
typed there resolves through the registry as long as its provider is configured, so a model
released after the last catalog refresh is still usable before the refresh lands.
