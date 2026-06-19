# Provider-agnostic model layer: per-provider credentials, `provider:model` ids, server-side resolution

Anvika's server reaches every model - cloud or local - through one provider registry that maps a namespaced `provider:model` id string to a real AI SDK model. The client sends only the id; the server resolves it. The initial providers: `anthropic`, `openai`, `google`, `azure`, `openrouter`, `xai`, and `local` (the AI SDK openai-compatible provider pointed at the user's local server). (Amended 2026-06-07: `xai`/Grok added as a sixth cloud provider - an additive change, no settings migration. The catalog source behind the model list is recorded separately in ADR 0012.)

**Credentials are stored per provider, not as a single shared key.** The settings hold an optional credentials entry per cloud provider - `azure` additionally carries a resource name and a deployment - plus the local server base address. A model is offered and usable only when its provider's credentials are present; the model picker is gated on this. Keys live server-side and are never exposed to any client.

**Model ids use the AI SDK provider-registry convention `provider:model`** (e.g. `anthropic:claude-opus-4-8`, `local:llama-3.2-1b`, `openrouter:anthropic/claude-3.5-sonnet` - a slash inside the model segment is part of the provider's own model name).

Each registered model carries **capability flags**. The initial release needs only text generation, but the flag structure is present from the start so later capabilities can gate features (image input, tools) and disable unsupported affordances rather than presenting controls that then fail.

Rationale: the point of the agnostic core is "send an id, switch models freely." A single shared cloud-key field - as the spec's settings section originally implied - breaks the instant you select a model from a different provider, so it is replaced by the per-provider map.

## Considered Options

- **Single shared cloud key** (settings as originally written): rejected. One key cannot serve five providers and has no clear owner.
- **Narrow the initial cloud set to one or two providers, defer the rest via migration**: rejected as unnecessary. The per-provider map is a modest, bounded addition that delivers the full five-provider promise now.

## Consequences

- Corrects spec section 7 (a per-provider credentials map replaces the single cloud key) and tidies section 11.
- The settings Zod schema in `packages/shared` carries an optional per-provider credentials map; adding a provider later is an additive settings migration.
- The `unconfigured` API error (section 17) fires when the selected model's provider has no credentials, pointing the user to settings.
- The client never receives credentials; it only sends a `provider:model` id and reads the capability-gated model list from `GET /api/v1/models`.

## Update (provider-connections milestone)

The fixed per-provider credentials map (the `providers` object) and the single `localBaseUrl`
are REPLACED by user-managed, named CONNECTIONS. The original decision above (one registry, the
client sends only an id, server-side resolution, capability flags) stands unchanged; what changes
is the credential shape and the model-id namespace.

- Credentials are now a list of named connections, not a fixed provider map. The settings carry a
  `connections` array; each element is a Zod discriminated union on `type` with SEVEN types -
  `anthropic`, `openai`, `google`, `azure`, `openrouter`, `xai`, and `openai-compatible`
  (the catch-all for any OpenAI-compatible endpoint, which subsumes the old `local` provider) -
  defined in `packages/shared/src/settings/connection.ts`. A user may configure several
  connections of the same type (for example two `openai-compatible` endpoints), each with its own
  label and credential, which the fixed provider map could not express.
- The model-id scheme is now `<connectionId>:<model>`, split on the FIRST colon only
  (`parseModelId` in `apps/server/src/models/connection-type.ts`), so the CONNECTION ID namespaces
  the model rather than the provider name. A model id's prefix is a connection id, never a provider
  name; `connectionTypeFor` resolves the prefix to a connection's type via settings, and it is the
  single sanctioned place that derives a provider type from a model id.
- The settings schema ships as the v1 baseline (`CURRENT_SETTINGS_VERSION = 1` in
  `packages/shared/src/settings/schema.ts`): the provider-connections shape (`connections`, no fixed
  `providers` map or `localBaseUrl`) IS the starting schema, with no historical migration in the
  public repository. The version column and migrate-on-read machinery remain for future changes.
- The model catalog source behind the model list is recorded in ADR 0023 (which supersedes ADR
  0012). The connection secret channel - how `apiKey` and header values are written without ever
  riding the connections wire - is ADR 0024.
