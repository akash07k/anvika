# Live model discovery per provider

> Note: implemented per ADR 0023 (live model discovery and enrichment). This note is the
> pre-implementation survey and proposal; the recommended membership-versus-enrichment architecture
> below was built. The "Today Anvika serves a hand-maintained static catalog" framing in the intro is
> now historical - that static catalog is deleted. Membership now comes from live per-type discovery
> in `apps/server/src/models/discovery/` (per-provider adapters in
> `discovery/{anthropic,openai,google,xai,openrouter,openai-compatible}.ts`), and enrichment from
> `apps/server/src/models/enrichment/` over the committed `enrichment/snapshot.json` floor. Provider
> API shapes below were verified on 2026-06-12; re-verify before relying on them.

Date: 2026-06-12

How to get a CURRENT, accurate model list from each AI provider that Anvika supports,
so the available-model list (`GET /api/v1/models`) stops drifting. Today Anvika serves a
hand-maintained static catalog (seeded from models.dev) for most cloud providers
(`apps/server/src/models/catalog/{anthropic,openai,google,xai}.ts`) and only does LIVE
discovery for OpenRouter and the local server (`apps/server/src/models/discovery.ts`).
The static catalog drifts: it misses newly released models and keeps listing deprecated
ones. This note documents each provider's LIVE model-list API (endpoint, auth, response
shape, how to filter to chat/text models, whether it carries pricing, whether it returns
deprecated models), the models.dev catalog API as an enrichment source, and a recommended
membership-vs-enrichment architecture.

The split that runs through the whole note: a provider's own `/models` API is the right
source for MEMBERSHIP (which models the configured key can actually use, fresh, with
deprecated ones handled), but most of those APIs do NOT return pricing or context
metadata. That metadata comes from a separate ENRICHMENT layer (the static catalog and/or
a cached models.dev fetch). See ADR 0012 (model catalog source) and ADR 0004
(provider-agnostic model layer) for the decisions this builds on.

## Sources verified

All shapes below were verified against official documentation on 2026-06-12. Do NOT trust
memory for these shapes; re-verify on a refresh.

- Google: `https://ai.google.dev/api/models` (Generative Language API, ListModels).
- OpenAI: the official `openai/openai-node` SDK `Model` interface
  (`src/resources/models.ts`); the docs site itself blocks unauthenticated fetch (403).
- Anthropic: `https://platform.claude.com/docs/en/api/models-list` (was
  `docs.anthropic.com/en/api/models-list`, 301 redirect).
- xAI: `https://docs.x.ai/docs/api-reference` and the `xai-org/xai-sdk-python` README. The
  xAI docs are a client-rendered SPA, so fetch tools see only the chat endpoints; the
  Models API shape below is corroborated by the SDK README and is flagged where a field
  needs a live check.
- OpenRouter: already implemented and verified in Anvika (`discovery.ts`,
  `fetchOpenRouterModels`).
- Azure: `https://learn.microsoft.com/en-us/rest/api/azureopenai/models/list` (data-plane
  Models List) and `.../rest/api/aiservices/accountmanagement/deployments/list`
  (control-plane Deployments List).
- models.dev: `https://models.dev/api.json`.
- AI SDK provider id format: Context7 `/websites/ai-sdk_dev`
  (`google('gemini-2.5-flash')` takes the BARE id, no `models/` prefix).

## Google Gemini (Generative Language API)

This is the concrete complaint: the user has a Google key set and the static Google
catalog is stale. Google has a clean live list.

- Endpoint: `GET https://generativelanguage.googleapis.com/v1beta/models`.
- Auth: API key as a query parameter, `?key=API_KEY`. (It also accepts the
  `x-goog-api-key` header.) The endpoint returns 403 without a key.
- Pagination: `pageSize` (default 50, max 1000) and `pageToken`; the response carries
  `nextPageToken`. With pageSize=1000 a single call returns the whole list in practice.
- Response shape: `{ models: [ ... ], nextPageToken }`. Each model:
  - `name`: e.g. `models/gemini-2.5-pro` (the `models/` prefix MUST be stripped for the
    AI SDK; `@ai-sdk/google` expects the bare id, e.g. `google('gemini-2.5-flash')`).
  - `baseModelId`, `version`.
  - `displayName`: human-facing name (maps directly to Anvika `displayName`).
  - `description`.
  - `inputTokenLimit` (maps to `contextWindow`), `outputTokenLimit` (maps to
    `maxOutputTokens`).
  - `supportedGenerationMethods`: string array, e.g.
    `["generateContent", "countTokens"]`.
  - `thinking` (boolean), `temperature`, `maxTemperature`, `topP`, `topK`.
- Filter to chat/text models: keep only entries whose `supportedGenerationMethods`
  includes `"generateContent"`. This drops embedding models
  (`embedContent`), image-only and other non-chat endpoints.
- Pricing: NOT included. Must come from enrichment.
- Deprecated models: the list reflects what the key can call; Google removes retired
  models from the list rather than flagging them, so a fresh list is effectively free of
  long-dead models. There is no explicit deprecation field.
- Id mapping to Anvika: strip `models/` from `name`, then `google:<bareId>`.

Reliability: GOOD. Clean shape, single call, capability field present, freshness for free.

## OpenAI

- Endpoint: `GET https://api.openai.com/v1/models`.
- Auth: `Authorization: Bearer <key>`.
- Pagination: response is `{ object: "list", data: [...] }`. The SDK notes pagination is
  forwards-compatible only; no real paging occurs today, so one call returns everything.
- Response shape: each `Model` has EXACTLY four fields (verified against the
  `openai-node` `Model` interface):
  - `id`: string (e.g. `gpt-4o`, `text-embedding-3-large`, `whisper-1`, `dall-e-3`).
  - `object`: always `"model"`.
  - `created`: unix seconds.
  - `owned_by`: string.
- Filter to chat/text models: HARD. There is no capability, type, or modality field. The
  list mixes chat models with embeddings, TTS, transcription (whisper), image
  (dall-e / gpt-image), moderation, and realtime models. The only lever is id-prefix
  heuristics (e.g. exclude ids containing `embedding`, `whisper`, `tts`, `dall-e`,
  `image`, `moderation`, `audio`, `realtime`, `transcribe`), which is brittle and will
  misclassify future naming. This is the weak spot.
- Pricing: NOT included. No context window either.
- Deprecated models: deprecated ids generally drop off the list once retired, but there is
  no flag while they remain.
- Id mapping to Anvika: `openai:<id>`.

Reliability: WEAK for membership-as-chat-list (no capability filter); reliable only as a
raw id set. Best used as MEMBERSHIP gated by the catalog/models.dev: only surface ids that
have enrichment metadata, treating the catalog as the chat-model allowlist.

## Anthropic

- Endpoint: `GET https://api.anthropic.com/v1/models`.
- Auth: headers `x-api-key: <key>` and `anthropic-version: 2023-06-01`.
- Pagination: cursor-based with `before_id` / `after_id` / `limit` (default 20, max 1000);
  response carries `has_more`, `first_id`, `last_id`. Use `limit=1000` for one call, or
  page on `has_more`.
- Response shape: `{ data: [...], has_more, first_id, last_id }`. Each model (NOTE: richer
  than previously documented in Anvika - the API now returns capabilities and limits):
  - `id`: e.g. `claude-opus-4-6` (maps directly; this IS the AI SDK id).
  - `type`: always `"model"`.
  - `display_name`: e.g. `Claude Opus 4.6` (maps to `displayName`).
  - `created_at`: RFC 3339 datetime.
  - `max_input_tokens`: context window in tokens (maps to `contextWindow`).
  - `max_tokens`: max value for the `max_tokens` param (maps to `maxOutputTokens`).
  - `capabilities`: object with `image_input`, `pdf_input`, `structured_outputs`,
    `thinking`, `effort`, `citations`, `code_execution`, `batch`,
    `context_management` (each a `{ supported: boolean }` shape). Useful for later
    capability flags.
- Filter to chat/text models: all listed models are chat models, so no filter is needed;
  every entry is offerable for a text turn.
- Pricing: NOT included.
- Deprecated models: the list is current membership; retired models drop off. No explicit
  deprecation field in the list (deprecation dates live in separate docs).
- Id mapping to Anvika: `anthropic:<id>`.

Reliability: GOOD. Clean membership, display names and now context/output limits and
capability flags come free; only pricing must be enriched.

## xAI (Grok)

xAI exposes two listing endpoints. The docs site is a client-rendered SPA (fetch tools see
only the chat endpoints), so field names below are corroborated by the `xai-sdk-python`
README ("Retrieve information on different models available to you, including name,
aliases, token price, max prompt length") and should be re-checked against a live call.

- OpenAI-compatible list: `GET https://api.x.ai/v1/models`, `Authorization: Bearer <key>`.
  Returns the OpenAI shape `{ object: "list", data: [{ id, object, created, owned_by }] }`
  - bare ids, NO pricing or context. Good for membership only.
- Rich list: `GET https://api.x.ai/v1/language-models`, `Authorization: Bearer <key>`.
  Returns per-model metadata INCLUDING pricing and modalities. Documented/observed fields:
  - `id` (e.g. `grok-4`), `fingerprint`, `created`, `version`.
  - `input_modalities`, `output_modalities` (arrays, e.g. `["text", "image"]`).
  - `prompt_text_token_price`, `prompt_image_token_price`,
    `completion_text_token_price`, `cached_prompt_text_token_price`, `search_price`.
  - `aliases` (e.g. `grok-4` aliasing a dated id), `max_prompt_length` (context window).
- Price UNIT (VERIFY on a live call before relying on it): xAI returns token prices as
  INTEGERS, not floats. They are widely documented as USD cents per 100,000,000 tokens
  (i.e. divide by 1e8 to get cents per token, or multiply by 0.01 and divide by 100 to get
  USD per token; equivalently USD-per-million = integer / 100). Do NOT assume; confirm the
  scale against a known Grok price before mapping. Anvika stores USD per million tokens.
- DECISION (2026-06-13): the xAI adapter (`discovery/xai.ts`, `discoverXaiModels`) maps NO
  live metadata yet - it returns bare `{ id }` `DiscoveredModel`s. The price unit above is
  only flagged, not officially confirmed (the xAI docs site is a client-rendered SPA, so a
  fetch sees only the chat endpoints), and `max_prompt_length` as the context window is
  corroborated only by the SDK README, not a fetchable spec. Per the unit-safety rule (a
  wrong conversion is worse than no value), no xAI field is mapped until its unit is
  verified against a live call; enrichment falls through to models.dev/snapshot as before,
  which is the pre-existing behavior. The discovery wiring (`DiscoveredModel` return shape)
  is in place, so a future verified mapping is a one-function change with no plumbing work.
- Filter to chat/text models: keep entries whose `output_modalities` includes `text` (same
  rule already used for OpenRouter via `outputsText`).
- Deprecated models: list is current membership; `aliases` lets a stable id (`grok-4`)
  point at the live dated version.
- Id mapping to Anvika: `xai:<id>`.

Reliability: GOOD via `/v1/language-models` (pricing, context, and a modality filter all
present in one call). Prefer it over `/v1/models`. Only caveat is verifying the price unit.

## OpenRouter (live in Anvika, listing meta now wired into enrichment)

Field names and UNITS re-confirmed 2026-06-13 against the official `GET /api/v1/models`
docs via Context7 (`/websites/openrouter_ai`), because the adapter now CONVERTS the
pricing and reads context. The verified example response (GPT-4) carries
`pricing.prompt: "0.00003"` and `top_provider.max_completion_tokens: 4096` with
`context_length: 8192`.

- Endpoint: `GET https://openrouter.ai/api/v1/models`, `Authorization: Bearer <key>`.
- Response: `{ data: [...] }`. Each entry (fields Anvika reads):
  - `id`: bare slash id (e.g. `openai/gpt-4`).
  - `architecture.output_modalities`: string array (the text-output filter).
  - `pricing.prompt` / `pricing.completion`: decimal STRINGS, USD PER SINGLE TOKEN
    (confirmed: `"0.00003"` for GPT-4 prompt = $30 per million). Anvika stores USD per
    MILLION, so the conversion is `parseFloat(x) * 1_000_000`, guarding empty/NaN/negative
    to null. The `pricing` object also has `image`, `request`, `web_search`,
    `internal_reasoning`, `input_cache_read`, `input_cache_write` - not used.
  - `context_length`: number of tokens (maps to `contextWindow`).
  - `top_provider.max_completion_tokens`: `number | null` (maps to `maxOutputTokens`).
- Filter: keep entries whose `architecture.output_modalities` includes `text` (current
  `outputsText` rule; defaults to keep when the field is absent).
- Mapped to Anvika `ModelMeta`: `inputPrice` = prompt per million, `outputPrice` =
  completion per million, `contextWindow` = `context_length`, `maxOutputTokens` =
  `top_provider.max_completion_tokens`. When ALL four are null the adapter omits `meta`
  entirely (returns `{ id }`) so enrichment falls through to models.dev/snapshot cleanly.
- Id mapping to Anvika: `openrouter:<id>` (note ids contain slashes, e.g.
  `anthropic/claude-sonnet-4.5`; the registry separator splits on the first colon only, so
  the slashes survive).

The adapter (`discovery/openrouter.ts`, `discoverOpenRouterModels`) returns
`DiscoveredModel[]` (`{ id, meta? }`); the service threads `meta` into `enrich` as the
highest-priority per-field override (ADR 0023).

Reliability: GOOD. The richest single list - membership AND enrichment in one call.

## Azure AI Foundry / Azure OpenAI

Azure is the genuinely awkward one because what Anvika needs is the user's NAMED
DEPLOYMENTS, and those are not on the data plane.

- Data-plane Models List (api-key auth):
  `GET {endpoint}/openai/models?api-version=2024-10-21`, header `api-key: <key>`. Returns
  `{ object: "list", data: [ { id, object, created_at, capabilities, lifecycle_status,
  deprecation, status, model, fine_tune } ] }`. `capabilities` has booleans
  `chat_completion`, `completion`, `embeddings`, `fine_tune`, `inference`;
  `lifecycle_status` is `preview` or `generally-available`; `deprecation` carries unix
  end-of-inference dates. This lists BASE MODELS the resource can access plus fine-tunes -
  NOT the user's deployment names. No pricing.
- Control-plane Deployments List (Azure AD / ARM auth, NOT the inference key):
  `GET https://management.azure.com/subscriptions/{sub}/resourceGroups/{rg}/providers/
  Microsoft.CognitiveServices/accounts/{account}/deployments?api-version=2025-06-01`.
  This returns the user-named deployments (`name`, `properties.model.{name,version}`,
  `capabilities` including `maxContextToken`/`maxOutputToken` on some SKUs). But it
  requires a bearer token from Azure AD plus subscription id, resource group, and account
  name - none of which Anvika collects (Anvika only has resourceName + apiKey + deployment;
  see `assembleAvailableModels`).
- Conclusion: with only the inference api-key, Anvika CANNOT list the user's deployments.
  The data-plane Models List gives base-model availability and capability/deprecation
  flags but not deployment names (the chat call addresses a deployment, not a base model).
  Azure must stay user-entered/synthetic: keep the current behavior (synthesize
  `azure:<deployment>` from the configured deployment name). Optionally, the data-plane
  Models List could VALIDATE that the base model behind a deployment is GA/not deprecated,
  but it cannot replace user entry.

Reliability: WEAK for membership (no deployment listing without ARM credentials). Leave
synthetic.

## models.dev as the enrichment source

models.dev is the source the static catalog was already seeded from. It publishes a
machine-readable catalog.

- Endpoint: `GET https://models.dev/api.json` (no auth).
- Shape: a single JSON object keyed by PROVIDER ID at the top level (`anthropic`,
  `openai`, `google`, `xai` and `x-ai`, plus many more - openrouter and dozens of
  gateways). Each provider object: `{ id, env, npm, api, name, doc, models }` where
  `models` is a MAP keyed by model id. Each model:
  - `id`, `name`, `family`.
  - `attachment`, `reasoning`, `tool_call`, `temperature`, `structured_output`
    (booleans - future capability flags).
  - `knowledge` (e.g. `2024-09`), `release_date`, `last_updated` (YYYY-MM-DD).
  - `modalities`: `{ input: [...], output: [...] }`.
  - `open_weights` (boolean).
  - `cost`: `{ input, output, cache_read, cache_write }` in USD per MILLION tokens
    (already Anvika's unit - no conversion needed).
  - `limit`: `{ context, output }` in tokens.
- Coverage: anthropic, openai, google, xai all present; openrouter present too. So a single
  fetch can enrich every Anvika cloud provider with pricing + context + capabilities,
  keyed by `provider + model id`.
- Freshness/reachability caveats: models.dev is a community-maintained catalog, so brand
  new models can lag the provider's own list by days, and a network blip can make
  `api.json` unreachable. Treat it as best-effort enrichment with a cached fallback, never
  as the membership authority. It is also a large payload - fetch it once and cache.
- Licensing: the `api.json` payload carries no inline license/attribution; the models.dev
  project is open-source (community catalog). If we ship a cached copy, attribute the
  source. Re-confirm the repo license before redistributing the cached blob.

models.dev can serve as the SINGLE enrichment source across providers, replacing the
per-provider hand-maintained `cost`/`limit` rows with one keyed lookup. The static
per-provider catalog then shrinks to an offline FLOOR (last-known-good snapshot) used only
when both the live list and the models.dev fetch are unavailable.

## Recommended discovery + enrichment architecture for Anvika

The design that removes drift while keeping the endpoint robust:

1. MEMBERSHIP from each provider's own live `/models` API (fresh, no long-dead models),
   gated on that provider's configured key. This replaces the static catalog as the SOURCE
   OF TRUTH for "which models exist".
   - Google: `v1beta/models`, filter `supportedGenerationMethods` includes
     `generateContent`, strip `models/`.
   - Anthropic: `v1/models` (all chat; carries display name + limits + capabilities).
   - xAI: `v1/language-models` (carries pricing + modalities; filter on text output).
   - OpenRouter: `v1/models` (already live; carries everything).
   - OpenAI: `v1/models`, but there is NO capability filter - intersect the raw id set with
     the enrichment catalog so only known chat models surface (catalog-as-allowlist).
   - Azure: stays SYNTHETIC from the configured deployment (no data-plane deployment list).
   - Local: unchanged (`{baseUrl}/models`, the only source of its membership).

2. ENRICHMENT layer attaches pricing / context / capabilities to each member, keyed by
   `providerId + native model id`, in priority order: (a) the live list's own metadata
   when it carries it (OpenRouter, xAI, Anthropic limits); (b) a cached models.dev
   `api.json` lookup; (c) the committed static snapshot. A member with NO metadata in any
   layer still appears, with `inputPrice`/`outputPrice`/`contextWindow` = null - Anvika
   already renders a null price as "cost omitted" and the schema allows nulls
   (`ModelInfoSchema` in `packages/shared/src/models/model-info.ts`). So a brand-new model
   shows up immediately, just without a price until enrichment catches up.

3. FAIL SOFT at every layer (preserve the ADR 0012 fail-soft guarantee). A failed or
   timed-out live fetch for a provider falls back to the cached/static list for that
   provider; a failed models.dev fetch falls back to the cached copy then the static
   snapshot; one malformed record is dropped by the final `ModelInfoSchema.safeParse`
   filter (already in `assembleAvailableModels`). A network blip or a gated/invalid key
   never empties the list. The custom-model-id escape hatch (ADR 0012) remains the
   never-stuck backstop.

4. CACHING / TTL so `/api/v1/models` does not hammer provider APIs on every call. Cache
   each provider's live list and the models.dev payload in memory (and optionally on disk
   under `userdata/`) with a TTL (a few minutes to a few hours is fine for a single-user
   app; models change on the order of weeks). Serve from cache within the TTL; refresh in
   the background or on a stale-while-revalidate read. The current per-call abort timeout
   (2000 ms, `DEFAULT_TIMEOUT_MS`) stays as the per-fetch ceiling. Discovery already runs
   per request today; add the cache so a settings page that polls models does not call out
   to five providers each time.

5. AUTH per provider (all read-only list calls):
   - Google: `?key=` query param (or `x-goog-api-key`).
   - OpenAI / xAI / OpenRouter: `Authorization: Bearer <key>`.
   - Anthropic: `x-api-key` + `anthropic-version` headers.
   - Azure data-plane (if used for validation only): `api-key` header + `api-version`.
   - Local: none.

6. ID MAPPING: every member becomes `${providerId}:${nativeId}` (the existing convention;
   the registry separator splits on the first colon so OpenRouter/xAI ids with slashes
   survive). Google needs the `models/` strip first.

### Comparison table

| Provider | Live list endpoint | Gives pricing? | Gives context? | Filter method | Reliability |
| --- | --- | --- | --- | --- | --- |
| Google Gemini | GET v1beta/models (key query param) | No | Yes (inputTokenLimit/outputTokenLimit) | supportedGenerationMethods includes generateContent | Good |
| OpenAI | GET v1/models (Bearer) | No | No | None - id-prefix heuristic or catalog allowlist | Weak (no capability field) |
| Anthropic | GET v1/models (x-api-key + version) | No | Yes (max_input_tokens/max_tokens) | None needed (all chat) | Good |
| xAI | GET v1/language-models (Bearer) | Yes (verify unit) | Yes (max_prompt_length) | output_modalities includes text | Good |
| OpenRouter | GET v1/models (Bearer) | Yes (per-token strings) | Yes (context_length) | architecture.output_modalities includes text | Good |
| Azure | Deployments List needs ARM/Azure AD, not the api-key | No | Partial (some SKUs) | n/a - cannot list deployments with key | Weak (stay synthetic) |
| Local | GET {baseUrl}/models (none) | No | No | None (trust the server) | Good (only source) |
| models.dev (enrichment, not membership) | GET api.json (none) | Yes (USD per million) | Yes (limit.context/output) | n/a - keyed by provider+id | Best-effort, cache + fallback |

### Net recommendation

- Membership can be discovered LIVE for Google, Anthropic, xAI, OpenRouter, and local -
  these should switch from static to live. OpenAI is discoverable as a raw id set but needs
  the catalog as a chat-model allowlist. Azure cannot be discovered with the inference key
  and stays synthetic from the configured deployment.
- Pricing must still come from a metadata layer for Google, OpenAI, and Anthropic (their
  list APIs omit it). xAI and OpenRouter carry pricing in the live list; everyone else
  enriches from models.dev (one keyed source, USD per million already) with the committed
  static snapshot as the offline floor.
- Membership-vs-enrichment split: provider `/models` decides WHO is on the list (fresh, no
  deprecated); a cached models.dev fetch plus the static floor decides WHAT each member
  costs and how big its context is; nulls are fine for brand-new models; every layer fails
  soft to the one below so the list never empties.
