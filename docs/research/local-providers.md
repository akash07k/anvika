# Local OpenAI-Compatible Providers

Context7 library used: `/vercel/ai` (Vercel AI SDK, source reputation: High, benchmark: 88.6).
Date: 2026-06-05. Ollama and llama.cpp default port/endpoint details are well-established
facts; marked "general knowledge, verify" where Context7 did not return a specific snippet.

This note focuses on what each local server exposes and how Anvika connects to it, not on the
Vercel AI SDK internals.

---

## What "local provider" means for Anvika

A local provider is a model server the **user starts independently** on their own machine.
Anvika never installs, downloads, manages, or terminates model runtimes (ADR 0005). Its
only job is to point at an already-running server's HTTP endpoint and speak the
OpenAI-compatible REST protocol.

The user supplies a base URL and optionally a model id in Settings. The Anvika server
resolves those into a `LanguageModel` via the provider registry and forwards all chat
traffic. If the local server is unreachable, Anvika surfaces a clear error; it does not
attempt to start the server.

---

## The connection protocol: OpenAI-compatible REST

All three local servers below expose an OpenAI-compatible surface (chat completions at
`POST /v1/chat/completions`, model listing at `GET /v1/models`). This is the only
protocol Anvika uses for local connections. No server-specific SDK or binary dependency
is needed.

---

## LM Studio

- Default base URL: `http://localhost:1234/v1`
- Port is configurable in LM Studio's "Local Server" tab; the user may change it.
- API key: not required by default. LM Studio's local server accepts requests with no
  `Authorization` header or with any dummy bearer token.
- Model listing: `GET http://localhost:1234/v1/models` returns the currently loaded
  model(s). LM Studio loads one model at a time; the list typically contains one entry.
- Streaming: supported.
- Tool calling and structured output: depends on the loaded model and LM Studio version.
  Must be treated as capability flags, not assumed (ADR 0004).

---

## Ollama

- Default base URL for the OpenAI-compatible surface: `http://localhost:11434/v1`
  (general knowledge, verify against Ollama docs).
- Ollama's native API root is `http://localhost:11434/api`; the OpenAI-compatible path
  is the `/v1` subtree. Use `/v1` when connecting via `@ai-sdk/openai-compatible`.
- Port: 11434 by default; configurable via `OLLAMA_HOST` env variable.
- API key: not required. Ollama accepts requests without an `Authorization` header or
  with any dummy bearer token when running locally.
- Model listing: `GET http://localhost:11434/v1/models` (OpenAI-compatible surface,
  general knowledge, verify). The native Ollama API uses `GET /api/tags`.
- Streaming: supported.
- Tool calling: supported on capable models (e.g. Llama 3 tool-call variants, Mistral
  Nemo). Capability varies by model; gate with a capability flag (ADR 0004).
- Note: a native Ollama community provider (`ollama-ai-provider-v2` / `ai-sdk-ollama`)
  also exists for advanced Ollama-specific params and native tool calling. For
  the initial release, the OpenAI-compatible path keeps the provider surface uniform and is
  sufficient.

---

## llama.cpp (llama-server)

- Default base URL: `http://localhost:8080/v1`
  (general knowledge, verify against llama.cpp docs).
- Port: 8080 by default; configurable via `--port` flag on `llama-server`.
- API key: llama-server accepts an optional `--api-key` flag. If the user sets one,
  Anvika must send it as `Authorization: Bearer <key>`. If none is set, any dummy value
  or no header is accepted. Anvika should surface an "API key (optional)" field in the
  local server settings form for this case.
- Model listing: `GET http://localhost:8080/v1/models` (general knowledge, verify).
  llama-server serves one model at a time; the list returns that model.
- Streaming: supported.
- Tool calling and structured output: model- and version-dependent; treat as capability
  flags (ADR 0004). `extractReasoningMiddleware` is needed for models that emit
  `<think>...</think>` tags rather than structured reasoning.

---

## Connecting via the Vercel AI SDK: `@ai-sdk/openai-compatible`

The `createOpenAICompatible` factory from `@ai-sdk/openai-compatible` wraps any
OpenAI-compatible endpoint into a first-class `LanguageModel` provider:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const lmstudio = createOpenAICompatible({
  name: 'lmstudio',
  baseURL: 'http://localhost:1234/v1',
  // apiKey omitted for LM Studio; pass a dummy string if the server rejects no-key
});

const model = lmstudio('llama-3.2-1b'); // model id as returned by GET /v1/models
```

The same pattern works for Ollama (`baseURL: 'http://localhost:11434/v1'`) and
llama-server (`baseURL: 'http://localhost:8080/v1'`), substituting the correct port and
model id.

Key constructor options:

- `name` (string, required) - identifies this provider in the registry and in log output.
- `baseURL` (string, required) - the local server's base URL including `/v1`.
- `apiKey` (string, optional) - sent as `Authorization: Bearer <apiKey>`. Omit or pass
  a dummy value for servers that do not enforce a key.
- `headers` (object, optional) - any extra HTTP headers.
- `fetch` (optional) - injectable fetch implementation for testing or proxying.
- `includeUsage` (boolean, optional) - request token-usage in streaming responses; some
  local servers omit this by default.
- `metadataExtractor` (optional) - extract non-standard fields (e.g. token counts) from
  local server responses.

The returned provider object is callable (`lmstudio('model-id')`) and also exposes
`.chatModel(id)`, `.completionModel(id)`, `.embeddingModel(id)`, and `.imageModel(id)`.

Streaming and tool-calling support **vary by local server and loaded model**. The SDK
does not detect these automatically. See the capability-flag section below.

---

## Anvika usage: settings, registry, and capability flags

### User-facing settings

The user configures a local provider in Settings with two fields:

- Base URL (e.g. `http://localhost:1234/v1`)
- Model id (copied from the server's model list or entered manually)

Anvika does not auto-discover running local servers. The user supplies the address.

### Server-side: provider registry

On startup, `apps/server` builds a `createProviderRegistry` instance. If a local server
base URL is present in settings, it instantiates a `createOpenAICompatible` provider for
it and registers it under a key like `local`. The UI sends the model id; the server
resolves it via `registry.languageModel('local:user-model-id')`. No model id string
travels to any cloud service.

### Capability flags (ADR 0004)

Local servers do not advertise capability in a machine-readable way via the OpenAI-compatible
`GET /v1/models` response. Anvika tracks capability per provider entry in its model catalog:

- `supportsTools` - whether to offer tool/MCP attachment in the UI.
- `supportsStreaming` - whether streaming is reliable; if false, apply
  `simulateStreamingMiddleware` so the accessible streaming UX is uniform.
- `supportsStructuredOutput` - whether to use JSON-schema constrained generation.
- `supportsReasoning` - whether to apply `extractReasoningMiddleware` for `<think>` tags.

By default, capability flags take the safe conservative values (streaming on,
tools off, structured output off, reasoning middleware applied) and can be overridden
via the local provider settings entry. Later work may add a probe/test call on
connection to set these automatically.

### Unreachable server handling

If the local server is unreachable, `streamText` throws a network error. Anvika catches
this at the `/api/v1/chat` route handler and returns a structured error response
(`{ code, message, details }` - the standard API error contract). The client renders
this as an `aria-live="assertive"` alert so screen-reader users are immediately informed.
Do not retry silently; surface the error with the base URL that was attempted so the
user can diagnose it.

---

## GAPS / verify

- Ollama's `/v1/models` response shape when accessed via the OpenAI-compatible surface:
  confirm field names match the OpenAI spec exactly (the native `/api/tags` has different
  fields). Test with a live Ollama instance.
- llama.cpp (`llama-server`) default port 8080 and `/v1/models` endpoint: confirm against
  current llama.cpp docs; port conflicts with common dev servers are possible.
- LM Studio: whether an empty `apiKey` or an omitted `Authorization` header is accepted
  depends on the LM Studio version. Test with the version in use and document the finding
  in a follow-up note.
- Capability auto-detection via a probe call: design deferred to later work. For now,
  defaults must be conservative and well-documented for the user.
- `GET /v1/models` as a connectivity check (ping before attempting chat): a useful UX
  improvement to consider later (surfacing "server connected / model count"
  in Settings before the user sends a message).
