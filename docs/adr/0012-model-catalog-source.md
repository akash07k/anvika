# Model catalog source: a static models.dev floor, live discovery for local and OpenRouter, and a custom-model-id escape hatch

Superseded by ADR 0023 (live model discovery and enrichment). The static catalog described below was deleted in the provider-connections milestone; live per-type discovery now decides model membership and an enrichment layer supplies metadata.


Anvika's available-model list (`GET /api/v1/models`) is assembled from a layered hybrid source rather than a single one. A static, committed **model catalog** seeded from models.dev is the metadata authority and offline floor for every configured cloud provider (display name, context window, max output, input/output price, capability flags), because a bare provider `/models` endpoint returns ids without that metadata. **Live `/models` discovery** augments it for exactly two providers: the local server (mandatory - only it knows which models are loaded) and OpenRouter (its live list is unusually rich and its catalog large and volatile, so a committed snapshot would be perpetually stale). For the gap between catalog refreshes - a model released after the last refresh that no list yet carries - the settings model picker offers a **custom-model-id escape hatch**: any `provider:model` id typed there resolves through the registry as long as its provider is configured.

## Considered Options

- **Static-only catalog for everything**: rejected. The local server's models are user-specific and unknowable offline, and a static snapshot of OpenRouter's large, fast-moving catalog is stale on arrival.
- **Fully live discovery for every provider**: rejected for the initial release. Provider `/models` endpoints return bare ids in five differing shapes (and Azure lists *deployments*, not models), without the pricing/context metadata we actually need - that metadata comes from models.dev regardless. Five per-provider live adapters are cost without the corresponding benefit.
- **Per-provider live `/models` for the cloud providers too**: deferred, not rejected. The merge seam is identical, so enabling it later is additive; the escape hatch already covers "use a model not in the list", and cloud freshness is better served by refreshing the catalog from models.dev (one source, full metadata, every provider) than by five id-only endpoints.

## Consequences

- The catalog is committed data with a documented refresh path (`curl -s https://models.dev/api.json`, re-derive the per-provider rows). Refreshing is a data edit, not a code change.
- Discovery is defensive: a failed live fetch degrades to the static floor (OpenRouter) or to no models (local), never an endpoint error. Discovered models are filtered to text-output-capable, so the picker never offers a model that cannot do text chat.
- Azure carries no catalog entries - its model id is the owner's configured deployment name, synthesised into the available list when Azure is fully configured.
- The escape hatch is the never-stuck guarantee: the user is never blocked on a stale list, which is what lets per-provider cloud live discovery stay deferred.
