# OpenAI-compatible providers and multiple named endpoints (Vercel AI SDK)

Durable reference for supporting arbitrary OpenAI-compatible AI providers, plus multiple
endpoints of the same provider type, using the Vercel AI SDK. This grounds a future design for
"multiple named provider connections" in Anvika. Research only; no application code or design
decisions are made here.

Installed versions verified against `node_modules/.bun/`:

- `ai@6.0.197`
- `@ai-sdk/openai-compatible@2.0.48`
- `@ai-sdk/azure` (installed; `AzureOpenAIProviderSettings`)
- `@ai-sdk/openai`

Sources:

- Installed type defs: `node_modules/.bun/@ai-sdk+openai-compatible@2.0.48+.../dist/index.d.ts`
  and `node_modules/.bun/ai@6.0.197+.../dist/index.d.ts` (authoritative for the API shape).
- Context7 library id `/vercel/ai` (openai-compatible provider docs + provider factory source).
- WebFetch: `https://ai-sdk.dev/providers/openai-compatible-providers/` (overview),
  `https://ai-sdk.dev/providers/openai-compatible-providers/nim` (NVIDIA NIM),
  `https://docs.venice.ai/guides/integrations/vercel-ai-sdk` (Venice),
  `https://venice.ai/settings/api` (API dashboard; login-gated, nothing useful public).
- Existing Anvika code: `apps/server/src/models/registry.ts`, `apps/server/src/models/discovery/`.

## 1. createOpenAICompatible API (installed @ai-sdk/openai-compatible@2.0.48)

The exact options object is `OpenAICompatibleProviderSettings`, quoted from the installed
`dist/index.d.ts`:

```ts
interface OpenAICompatibleProviderSettings {
  /** Base URL for the API calls. */
  baseURL: string;
  /** Provider name. */
  name: string;
  /**
   * API key for authenticating requests. If specified, adds an `Authorization`
   * header to request headers with the value `Bearer <apiKey>`. This will be added
   * before any headers potentially specified in the `headers` option.
   */
  apiKey?: string;
  /** Optional custom headers ... added AFTER any headers added by `apiKey`. */
  headers?: Record<string, string>;
  /** Optional custom url query parameters to include in request urls. */
  queryParams?: Record<string, string>;
  /** Custom fetch implementation (middleware / testing). */
  fetch?: FetchFunction;
  /** Include usage information in streaming responses. */
  includeUsage?: boolean;
  /** Whether the provider supports structured outputs in chat models. */
  supportsStructuredOutputs?: boolean;
  /** Transform the request body before sending (for proxy providers). */
  transformRequestBody?: (args: Record<string, any>) => Record<string, any>;
  /** Capture provider-specific metadata from responses (streaming + non-streaming). */
  metadataExtractor?: MetadataExtractor;
  /** The supported URLs for chat models. */
  supportedUrls?: OpenAICompatibleChatConfig['supportedUrls'];
  /** Usage converter for providers with non-standard token accounting. */
  convertUsage?: OpenAICompatibleChatConfig['convertUsage'];
}
```

Confirmations:

- `name` (required) is the provider id string. It is used as the `provider` field on the
  resulting model (`model.provider`), surfaces in error/telemetry, and is the camelCase key for
  `providerOptions`. It is NOT itself prefixed onto the model id by the provider; namespacing
  comes from `createProviderRegistry` (section 4).
- `baseURL` (required) is the URL prefix. Requests are built as `new URL(`${baseURL}${path}`)`
  where path is `/chat/completions`, `/completions`, `/embeddings`, `/images/generations`
  (from the factory source on Context7). A trailing slash on `baseURL` is stripped
  (`withoutTrailingSlash`). So `baseURL` should already include the version segment
  (for example `.../v1`).
- `apiKey` (optional) adds exactly `Authorization: Bearer <apiKey>`, BEFORE `headers`.
- `headers` (optional `Record<string,string>`) merges after the apiKey header, so it can add a
  second header or override `Authorization` for a non-Bearer scheme.
- `queryParams` (optional) appends URL query params to every request (the docs cite Azure AI
  Model Inference `api-version` as the motivating case).
- Also present beyond the prompt's list: `supportsStructuredOutputs`, `transformRequestBody`
  (rewrite the body for non-standard proxies), `metadataExtractor` (pull non-standard fields),
  `supportedUrls`, and `convertUsage` (remap token accounting). `includeUsage` is present.

Model factory methods on the returned `OpenAICompatibleProvider`:

```ts
provider('model-id')                 // callable: chat language model (default)
provider.languageModel('model-id')   // chat language model (accepts a Partial config override)
provider.chatModel('model-id')       // chat model
provider.completionModel('model-id') // text completion model
provider.embeddingModel('model-id')  // embeddings (textEmbeddingModel is deprecated alias)
provider.imageModel('model-id')      // image generation
```

`OpenAICompatibleChatModelId` is just `string`, so any model id passes through unchanged - the
"add a custom model id" escape hatch is free. Basic usage (Context7 `/vercel/ai`):

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

const provider = createOpenAICompatible({
  name: 'providerName',
  apiKey: process.env.PROVIDER_API_KEY,
  baseURL: 'https://api.provider.com/v1',
});

const { text } = await generateText({
  model: provider('model-id'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

Registry integration: yes. The returned provider implements `ProviderV3`
(`OpenAICompatibleProvider extends Omit<ProviderV3, 'imageModel'>` and re-adds `imageModel`), and
`createProviderRegistry` accepts `Record<string, ProviderV3>`. Anvika already does this in
`apps/server/src/models/registry.ts`:

```ts
if (localBaseUrl)
  registered.local = createOpenAICompatible({ name: 'local', baseURL: localBaseUrl });
return createProviderRegistry(registered, { separator: ':' });
```

## 2. Per-provider specifics

### Venice AI

- Base URL: `https://api.venice.ai/api/v1`.
- Auth: `Authorization: Bearer ${VENICE_API_KEY}` plus `Content-Type: application/json`.
- IMPORTANT divergence: the official Venice integration guide
  (`docs.venice.ai/guides/integrations/vercel-ai-sdk`) recommends `createOpenAI` from
  `@ai-sdk/openai` with `baseURL` set, then calling `.chat(modelId)` so requests go to
  `/chat/completions` rather than the Responses API. With the plain OpenAI provider, the default
  `provider(modelId)` may route to the Responses endpoint, which Venice does not serve; `.chat()`
  forces the chat-completions path. Venice is still a standard OpenAI-compatible chat-completions
  API, so `createOpenAICompatible({ name, baseURL, apiKey })` also works (it always targets
  `/chat/completions`) and is the simpler, uniform path for a multi-connection model. Either is
  viable; `createOpenAICompatible` avoids the OpenAI-provider Responses-vs-chat footgun.
- Venice-specific params: passed as provider metadata under `venice_parameters`, for example
  `experimental_providerMetadata: { venice_parameters: { enable_web_search: 'auto' } }`. Via
  `createOpenAICompatible`, the clean equivalent is `providerOptions: { <name>: { ... } }` keyed
  to the provider `name`, or `transformRequestBody` to inject `venice_parameters` into the body.
- Example model ids: `venice-uncensored`, `zai-org-glm-5-1`, `qwen3-vl-235b-a22b`,
  `qwen3-5-9b`, `text-embedding-bge-m3` (embeddings), `qwen-image` (image).
- Discovery: the integration guide does NOT document an OpenAI-style `/models` endpoint; it points
  to a model index at `https://docs.venice.ai/llms.txt`. Venice's REST API does expose
  `GET /api/v1/models` per its API reference, but the AI-SDK guide does not lean on it. Treat
  Venice discovery as "best effort / may require manual model ids."

### NVIDIA NIM

- Base URL: `https://integrate.api.nvidia.com/v1`.
- Auth: `Authorization: Bearer ${NIM_API_KEY}` (env `NIM_API_KEY`). The AI-SDK docs pass it via
  `headers` rather than `apiKey`, but `apiKey` produces the identical header:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const nim = createOpenAICompatible({
  name: 'nim',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  headers: { Authorization: `Bearer ${process.env.NIM_API_KEY}` },
});

// usage
nim.chatModel('deepseek-ai/deepseek-r1');
```

- Example model ids: `deepseek-ai/deepseek-r1`, `meta/llama-3.3-70b-instruct`.
- Capabilities note from the docs: "Model support for tool calls and structured output varies."
  Text generation and streaming are supported.
- Discovery: NIM (the hosted `integrate.api.nvidia.com`) exposes an OpenAI-style `GET /v1/models`
  list, but the AI-SDK page does not document discovery; the recommended wiring is just the
  `createOpenAICompatible` instance above with model ids referenced explicitly.

## 3. Model discovery (`GET {baseURL}/models`)

OpenAI-compatible servers commonly implement `GET {baseURL}/models` returning
`{ data: [{ id, ... }] }`. Anvika already relies on this for the local provider in
`apps/server/src/models/discovery/openai-compatible.ts` (`discoverOpenAiCompatibleModelIds` calls `GET {baseUrl}/models`, maps each
`data[].id`, and returns `[]` on any failure - discovery never fails the endpoint).

Reliability varies and is NOT uniform enough to be the sole picker source:

- The AI SDK provider itself does NOT call `/models`; `createOpenAICompatible` only constructs
  chat/embedding/image/completion model objects. Discovery is a separate HTTP call the
  application must make (as Anvika does).
- The list, when present, is OpenAI-shaped and minimal: usually just `id` (no context window,
  price, or capability flags). Anvika fills those as `null` for local (`displayName = id`).
- Some endpoints omit `/models`, gate it behind auth, or return a non-standard shape.

Practical stance for a multi-connection picker: attempt `GET {baseURL}/models` per connection,
populate the picker when it succeeds, and always allow a manual "type a model id" entry as the
fallback (the model-id string passes through the provider unchanged anyway). Cache and fail soft,
mirroring `fetchLocalModels`.

Discovery support by example provider:

| Provider                | `/models` list                | Notes                                            |
|-------------------------|-------------------------------|--------------------------------------------------|
| Local (LM Studio etc.)  | Yes (`GET {baseURL}/models`)  | id only; Anvika already discovers this           |
| OpenRouter              | Yes (rich list)               | Anvika uses `openrouter.ai/api/v1/models` direct |
| NVIDIA NIM (hosted)     | Yes (`GET /v1/models`)        | AI-SDK docs do not document it; use manual ids   |
| Venice                  | Partial (`/api/v1/models`)    | AI-SDK guide points to `llms.txt`, not `/models` |
| Generic OpenAI-compat   | Maybe                         | Must probe; fall back to manual entry            |

## 4. Multiple endpoints of the SAME provider type

`createProviderRegistry(providers, { separator: ':' })` takes a `Record<string, ProviderV3>`. The
record key is the namespace prefix; model resolution is `registry.languageModel('<key>:<modelId>')`
splitting on the FIRST separator (`ProviderRegistryProvider` types the id as
`` `${KEY}${SEPARATOR}${string}` ``). Key points for many same-type connections:

- Register several independent `createOpenAICompatible` instances, each with its own `name`,
  `baseURL`, and `apiKey`, under DISTINCT record keys:

```ts
const registry = createProviderRegistry(
  {
    venice: createOpenAICompatible({ name: 'venice', baseURL: 'https://api.venice.ai/api/v1', apiKey: vKey }),
    nim:    createOpenAICompatible({ name: 'nim',    baseURL: 'https://integrate.api.nvidia.com/v1', headers: { Authorization: `Bearer ${nimKey}` } }),
    'work-llm': createOpenAICompatible({ name: 'work-llm', baseURL: 'https://internal.example/v1', apiKey: wKey }),
  },
  { separator: ':' },
);
registry.languageModel('work-llm:llama-3.3-70b'); // resolves the user-defined connection
```

- The record key (the namespace prefix) must be unique; a duplicate key would overwrite the
  earlier connection. So each named connection needs a unique id used as its prefix. The prefix
  can be a user-defined connection id (`work-llm`, `venice-eu`), not just a fixed provider name -
  the registry only does a string-prefix lookup and passes the remainder through as the model id.
- The connection id (registry key) and the provider `name` need not match, but keeping them equal
  avoids confusion in logs/telemetry. The provider `name` is only used for `model.provider`,
  `providerOptions` keying, and error text - it does NOT participate in registry resolution.
- Separator caution: the registry splits on the FIRST occurrence of the separator, so a connection
  id must not contain `:`. Model ids MAY contain `:` after the first split point (the remainder is
  taken verbatim), so `nim:deepseek-ai/deepseek-r1` works. Choose connection ids that exclude the
  separator character (validate/slugify user-entered ids).

## 5. Azure and OpenAI - multiple endpoints

Both can be instantiated multiple times and registered under distinct ids.

Azure (`@ai-sdk/azure`, `createAzure`) - from installed `AzureOpenAIProviderSettings`:

- `resourceName?` builds `https://{resourceName}.openai.azure.com/...`, OR
- `baseURL?` overrides the prefix (when set, `resourceName` is ignored); resolved URL is
  `{baseURL}/v1{path}` (or `{baseURL}/deployments/{deploymentId}{path}?api-version=...` when
  `useDeploymentBasedUrls: true`).
- `apiVersion?` sets the `api-version` query param; `useDeploymentBasedUrls?` toggles the
  deployment-based URL scheme.

So multiple Azure connections = multiple `createAzure({ resourceName | baseURL, apiKey, apiVersion })`
under distinct registry keys. Anvika currently wires one Azure provider keyed on
`resourceName` + `deployment` + `apiKey` (`registry.ts`). Gotcha: Azure addresses a deployment, not
a free-form model id - the "model id" in Azure is the deployment name, and the resource/deployment
pairing is per-connection, so a multi-connection model must carry resourceName/deployment per
connection rather than a single global model string.

OpenAI (`@ai-sdk/openai`, `createOpenAI`): supports a `baseURL` override (plus `apiKey`, `name`,
`headers`, `organization`, `project`). That makes it usable against OpenAI-compatible gateways too,
but for arbitrary gateways `createOpenAICompatible` is the cleaner choice because the plain OpenAI
provider defaults to the Responses API for `provider(id)` and you must use `.chat(id)` to force
chat-completions (the same Venice footgun in section 2). For multiple OpenAI endpoints, instantiate
multiple `createOpenAI({ baseURL, apiKey })` under distinct keys.

General gotcha: each connection builds a fresh provider instance; Anvika already rebuilds the whole
registry per request from settings (`buildRegistry`), so a just-saved key/baseURL takes effect with
no restart. That per-request rebuild scales naturally to N user connections.

## 6. Headers and custom auth

- Standard Bearer: set `apiKey`; it produces `Authorization: Bearer <apiKey>` added BEFORE
  `headers`.
- Extra headers (for example a tenant or `api-key` header): use `headers`, which merges AFTER the
  apiKey header. Because `headers` is applied after, it can also OVERRIDE `Authorization` for a
  non-Bearer scheme (for example `headers: { Authorization: 'Token abc' }` or
  `headers: { 'api-key': key }`) - in that case leave `apiKey` unset to avoid a redundant Bearer
  header.
- Dynamic/per-request auth, signing, or anything `headers` cannot express statically: use the
  `fetch` override (`FetchFunction`) as the escape hatch - intercept the request and mutate headers
  before delegating to global `fetch`. This is also the testing seam.
- Query-param auth or versioning: use `queryParams` (for example `{ 'api-version': '...' }`).

## 7. Pitfalls and gotchas for a robust multi-connection design

- Usage / token counts: streaming token usage requires `includeUsage: true` (it sends
  `stream_options.include_usage` to the upstream). Without it, streaming responses may report no
  usage. Non-standard accounting can be remapped with `convertUsage`. Some compatible servers omit
  usage entirely; do not assume token counts are always present. (Separately: AI Gateway /
  providerMetadata does not surface cost data - cost must be computed from a price catalog.)
- Streaming: supported across openai-compatible chat models; the SDK adds `stream: true`. Some
  self-hosted servers stream poorly or not at all - fail soft.
- Reasoning: the chat model supports reasoning content and a `reasoningEffort` chat option, but
  whether a given endpoint honors it varies (NIM docs explicitly say support varies). Reasoning
  models can also produce artifacts that complicate stateless replay (a known Anvika concern).
- Error shapes: the provider validates against `openaiCompatibleErrorDataSchema`
  (`{ error: { message, type?, param?, code? } }`). Non-conforming servers may return errors the
  parser cannot read, degrading error messages. A custom `errorStructure` can be supplied at the
  lower level but is not exposed on `OpenAICompatibleProviderSettings`.
- Responses vs chat-completions: only relevant to the plain OpenAI/Azure providers
  (`provider(id)` may hit the Responses API; use `.chat(id)`). `createOpenAICompatible` always
  targets `/chat/completions`, so it sidesteps this - a reason to prefer it for arbitrary
  endpoints.
- Body shape: proxies that need a non-standard body (extra top-level fields, renamed params) need
  `transformRequestBody`; provider-specific extras (like `venice_parameters`) go through
  `providerOptions[name]` or `transformRequestBody`.
- baseURL hygiene: include the version segment (`/v1`), no trailing slash needed (stripped). A
  wrong/missing version segment is the most common 404 cause.
- Discovery is not built in: `/models` is a separate app-level call and is not uniformly available
  (section 3) - always allow manual model-id entry.
- Capability flags: discovery rarely returns context window / price / tool-or-vision flags for
  generic endpoints; the picker must tolerate nulls (as Anvika's `ModelInfo` already does for
  local).

## Example provider table

| Provider              | Base URL                                | Auth                          | Discovery (`/models`)     | SDK wiring                                  |
|-----------------------|-----------------------------------------|-------------------------------|---------------------------|---------------------------------------------|
| Venice                | `https://api.venice.ai/api/v1`          | `Bearer <key>`                | Partial (guide says no)   | `createOpenAICompatible` (or OpenAI `.chat`)|
| NVIDIA NIM (hosted)   | `https://integrate.api.nvidia.com/v1`   | `Bearer <key>` (NIM_API_KEY)  | Yes (undocumented here)   | `createOpenAICompatible`                    |
| OpenRouter            | `https://openrouter.ai/api/v1`          | `Bearer <key>`                | Yes (rich)                | dedicated provider or openai-compatible     |
| Local (LM Studio etc) | `http://localhost:1234/v1`              | none / optional               | Yes (id only)             | `createOpenAICompatible` (Anvika `local`)   |
| Generic OpenAI-compat | user-supplied `.../v1`                  | Bearer or custom header       | Maybe (probe)             | `createOpenAICompatible`                    |

## Implications for Anvika's connection model

- `createOpenAICompatible` cleanly covers Venice, NIM, and arbitrary OpenAI-compatible endpoints
  with a single uniform shape: `{ name, baseURL, apiKey | headers, queryParams? }`. It already
  backs Anvika's `local` provider. A "named connection" maps directly onto one
  `createOpenAICompatible` instance.
- A connection record needs at minimum: a unique connection id (the registry namespace prefix,
  must exclude `:`), a `baseURL` (with `/v1`), and credentials (apiKey for Bearer, or a custom
  `headers` entry for non-Bearer / extra-header auth). Optional: `queryParams`,
  `transformRequestBody` for provider quirks, a display label.
- Multiple connections of the same type are supported with no special handling - just distinct
  registry keys. The existing per-request `buildRegistry` pattern extends to iterate a user's
  connection list and register each, so a new connection takes effect with no restart.
- Model ids stay `connectionId:modelId`. Because the provider passes any model string through and
  the registry splits on the first separator, the existing `selectedModelId` resolution and the
  manual custom-model-id escape hatch work unchanged for user-defined connections.
- Discovery should be opportunistic and fail-soft per connection (reuse the `fetchLocalModels`
  pattern - `GET {baseURL}/models`, map ids, return `[]` on failure), always backed by manual
  model-id entry since not all endpoints expose `/models` and the list rarely carries capability
  or price metadata.
- Set `includeUsage: true` on connection instances if token-usage reporting matters during
  streaming; tolerate missing usage from servers that do not return it.
- Azure and OpenAI multi-endpoint also fit (distinct `createAzure` / `createOpenAI` instances per
  connection) but carry their own caveats: Azure addresses deployments (carry
  resourceName/deployment per connection) and the plain OpenAI provider needs `.chat()` to avoid
  the Responses API. For arbitrary user-added endpoints, prefer `createOpenAICompatible` to dodge
  the Responses-vs-chat footgun.
