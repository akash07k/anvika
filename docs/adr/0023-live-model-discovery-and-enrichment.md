# Live per-type model discovery for membership, a layered enrichment for metadata, and the retired static catalog

Status: Accepted. Supersedes ADR 0012 (model catalog source).

Anvika's available-model list now separates two concerns that the old static catalog conflated.
MEMBERSHIP - which models a connection can actually use - comes from LIVE per-type discovery
adapters that call each provider's own model-listing endpoint. METADATA - a model's price, context
window, and max output - comes from a separate, layered ENRICHMENT lookup. The hand-maintained
static catalog that ADR 0012 used for both is deleted; its only surviving role (offline pricing) is
served by a committed enrichment snapshot. Research: `docs/research/model-discovery.md`.

## Context

ADR 0012 served most cloud providers from a static catalog seeded from models.dev and did live
discovery only for OpenRouter and the local server. That catalog drifts: it misses newly released
models and keeps listing retired ones, and refreshing it is a hand-edit. The provider-connections
milestone (ADR 0004 as amended) also changed the unit of credentials from a fixed provider map to
named connections, so membership now has to be discovered per CONNECTION, not per provider.

The membership-vs-enrichment split runs through the whole design: a provider's own `/models` API is
the right source for which models exist (fresh, no long-dead ids), but most of those APIs do not
return pricing or context metadata - that has to come from somewhere else.

## Decision

### Membership from live per-type discovery

Model membership comes from live discovery adapters under
`apps/server/src/models/discovery/` - one per discoverable type (`google`, `anthropic`, `xai`,
`openrouter`, `openai`, `openai-compatible`) plus a dispatch (`dispatch.ts`), a shared
`fetchJson` helper (`shared.ts`), and a fail-soft `TtlCache` (`cache.ts`). `discoverModels`
dispatches on `connection.type` and returns the discovered models as `DiscoveredModel` (a bare model
id plus optional live metadata); the caller unions them with the connection's `manualModelIds`,
enriches, and caches.

Every adapter is FAIL-SOFT: `fetchJson` returns `null` on any network error, non-2xx, or parse
failure (it never throws), and each adapter validates the body with Zod at the boundary and
collapses any failure to `[]`. A gated or invalid key, a network blip, or a malformed body never
errors `GET /api/v1/models`; it simply contributes no models. No adapter logs the key, headers, or
base URL. The never-log-base-URL rule holds beyond the adapters: the settings-save log redacts a
connection's `baseUrl`, `resourceName`, and `apiVersion` (via `redactSettingsPatch`) so a host
identifier never reaches the application log on a settings PATCH either.

Per-type specifics ground the membership rules:

- Google, Anthropic, xAI, and OpenRouter list cleanly; OpenRouter additionally filters to
  text-output models (`architecture.output_modalities` includes `text`, default-keep when absent).
- OpenAI's `/v1/models` mixes chat, embedding, audio, and image models with NO capability field, so
  the `openai` adapter applies a chat-family allowlist HEURISTIC: it keeps only ids matching
  `^(gpt-|o1|o3|o4|chatgpt-)`, THEN drops ids matching a non-chat denylist
  (`image|audio|realtime|transcribe|tts|embedding|moderation`) so `gpt-`-prefixed non-chat models
  (e.g. `gpt-image-1`, `gpt-4o-audio-preview`) never surface as selectable chat models. Models the
  heuristic misses can still be added through a connection's `manualModelIds` escape hatch.
- `openai-compatible` calls `{baseUrl}/models`, sends `Authorization: Bearer` only when a key is
  set, and forwards any custom headers; many compatible endpoints expose no listing, so a
  missing/empty list is a normal `[]`.
- `azure` has NO data-plane model listing reachable with only the inference key (listing the user's
  deployments needs ARM/Azure AD credentials Anvika does not collect). So the index dispatch returns
  `[]` for `azure`, and an Azure deployment reaches the models list ONLY via the connection's
  `manualModelIds`.

### Metadata from a layered enrichment

Metadata comes from `apps/server/src/models/enrichment/`. `enrich(type, model, opts)` resolves a
model's `{ inputPrice, outputPrice, contextWindow, maxOutputTokens }` (all nullable) by a PER-FIELD
merge in priority order:

1. A live-list `override` - metadata the connection's own live list already carried (for example
   OpenRouter carries pricing and context inline). Highest priority, but PER FIELD: the override wins
   only on each of its NON-NULL fields. A complete override (all four fields non-null) short-circuits
   the base lookup and is returned as-is; a partial override fills its null fields from the layers
   below rather than clobbering them with nulls.
2. A cached models.dev fetch (`modelsdev.ts`): `https://models.dev/api.json`, public and keyless,
   cached ~30 minutes in the shared `TtlCache` with fail-soft reuse of the last good catalog, keyed
   by connection type + bare model id (with an `xai`/`x-ai` provider alias).
3. The committed `snapshot.json` (`snapshotMeta`).
4. `null` metadata when no layer has data - a brand-new model still appears, just without a price or
   context until enrichment catches up.

The discovery adapters return `DiscoveredModel` (a bare id plus optional `meta`); the OpenRouter
adapter attaches live `meta` from the listing's `pricing` and `context_length` (USD per million after
a per-token-to-per-million conversion), and the service threads that `meta` into `enrich` as the
`override`. The xAI adapter currently attaches NO `meta`: its `/v1/language-models` listing carries
price fields, but their unit is not confirmable against official docs (the docs site is a
client-rendered SPA), and a wrong unit conversion is worse than none, so xAI falls through to
models.dev/snapshot until the unit is verified.

`snapshotMeta(type, model)` is a SYNCHRONOUS read of the bundled snapshot, used as the price lookup
by `price.ts` (`priceForModelId`) so the chat finish seam can snapshot the rate that applied to a
turn without awaiting a network fetch. openai-compatible and azure ids without a snapshot row return
`null` (cost omitted).

### Catalog retirement

The former static catalog directory (`apps/server/src/models/catalog/`) is DELETED. Its only
remaining responsibility - offline pricing - is now served by the enrichment snapshot. The committed
`snapshot.json` was hand-seeded from the old catalog rows so pricing did not regress at the cutover.
It is regenerable from the live models.dev catalog via `tooling/refresh-models-snapshot.ts`, which
is run MANUALLY when prices drift and is NOT part of the build (the build ships the committed
snapshot as-is).

## Considered Options

- **Keep the static catalog as the membership source (ADR 0012, status quo):** rejected. It drifts -
  missing new models, listing retired ones - and it could not express membership per connection now
  that credentials are named connections rather than a fixed provider map. Live per-type discovery
  removes the drift at the source.
- **Live discovery for membership but also for metadata (read pricing from each provider's list):**
  rejected as the primary path. Most provider list APIs omit pricing and context, and the few that
  carry it disagree on units; a single keyed enrichment source (models.dev, already USD per million)
  plus a committed snapshot is one place to get metadata for every type. The live list's own
  metadata is still used when present, as the highest-priority `override` that wins per non-null
  field (so a partial live list never clobbers good models.dev/snapshot data, and a field whose unit
  cannot be confirmed is left null to fall through).
- **Generate the static catalog from models.dev at build time (the follow-up once envisaged under
  ADR 0012):** subsumed. Rather than regenerate a static catalog that membership reads, membership moved
  to live discovery and the only generated artifact left is the pricing snapshot, refreshed by a
  manual script.
- **Discover Azure deployments live:** rejected for now. The data-plane listing the inference key can
  reach lists base models, not the user's named deployments, and the control-plane Deployments List
  needs ARM/Azure AD credentials plus subscription/resource-group/account ids that Anvika does not
  collect. Azure stays manual-only (`manualModelIds`); auto-listing is deferred.

## Consequences

- The model list is fresh by construction: each connection's membership reflects what its key can
  actually call right now, with no hand-maintained catalog to age.
- Every discovery layer fails soft, so a bad key or an unreachable endpoint degrades to fewer models,
  never an endpoint error. The `TtlCache`'s last-good reuse means a transient discovery or models.dev
  failure does not empty a previously good list.
- Pricing has an offline floor (the committed snapshot) and an online refresh (cached models.dev),
  so the chat finish seam can always price a turn synchronously, while drift is corrected by a manual
  snapshot refresh rather than a code change.
- Azure remains manual-only until auto-listing lands; an Azure deployment that the owner does not list via
  `manualModelIds` simply does not appear.
- The OpenAI chat-family heuristic is a deliberate, documented brittleness: a future OpenAI naming
  scheme the prefix list does not match would be missed, and the `manualModelIds` escape hatch is the
  backstop. This is recorded so the heuristic's "why" survives a later naming change.
- Implementing files: `apps/server/src/models/discovery/` (adapters, `dispatch.ts`, `shared.ts`
  with the `DiscoveredModel` type, `cache.ts`), `apps/server/src/models/enrichment/` (`enrich.ts`,
  `modelsdev.ts`, `meta.ts`, `snapshot.json`), `apps/server/src/models/price.ts`, and
  `tooling/refresh-models-snapshot.ts`.
