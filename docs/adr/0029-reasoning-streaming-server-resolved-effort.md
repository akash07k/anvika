# Reasoning streaming: the server resolves effort and gates by a capability registry

Reasoning/thinking models stay silent while they think, so a long thinking phase reads as a stalled
or dead stream and gives a screen-reader user no feedback. Reasoning streaming sends the model's thinking to
the client for liveness and as an accessible, navigable region. Two facts force design decisions.
First, reasoning is opt-in per provider (OpenAI `reasoningSummary`, Anthropic `thinking`, Google
`thinkingConfig` or the unified `reasoning` level) and several providers ERROR when those options are
sent to a non-reasoning model, so enabling reasoning is a per-provider, per-model decision. Second,
the user controls reasoning through a single "thinking effort" value (`off | low | medium | high`)
set at three layers: a sticky per-conversation override, a per-connection override, and a global
default. Something must resolve that cascade and decide, per model, whether and how to ask for
reasoning.

The decision: the SERVER resolves the effort cascade and gates it through a data-driven capability
registry; reasoning is persisted but pruned from replay.

Rationale: Anvika is API-first (ADR 0001, clients are thin) and the server owns persistence (ADR
0003). Putting the cascade resolution in the server keeps every client (this web app, a future
mobile app) thin and behaving identically, with one source of truth. A data-driven registry keyed on
(connection type, provider-native model id) makes "which models reason and how to enable each" a
one-line data edit rather than scattered control flow, and a conservative default (unmatched returns
not-supported) means an unknown model never receives options that could error a turn.

## Considered Options

- **Effort resolution in the client, sent as a per-request field (rejected):** the client holds all
  the layers, so it could resolve the cascade and send a boolean/effort on the chat request; the
  server would only gate by capability. Minimal contract change and no toggle-then-send race. Rejected
  because it pushes business logic (the precedence cascade) into the client, so every future client
  must re-implement it identically and they will drift, and it splits conversation state across client
  and server. This contradicts the thin-client (ADR 0001) and server-owns-persistence (ADR 0003)
  charter. The one downside of the chosen option (ordering a toggle before an immediate send) is
  handled by awaiting the in-flight override write in the send path.
- **Scattered per-provider capability checks (rejected):** inline `if provider === ... && id matches`
  branches at the chat call site. Rejected as not future-proof: every new reasoning model edits
  control flow, and the error-prone providers (Anthropic and Google error on a wrong-shaped or
  non-reasoning request) make conservative, centralized matching important.
- **A live provider capability API (not available):** no provider reliably reports "this model
  supports reasoning" in a uniform way, and Azure deployment names do not even encode the underlying
  model. So capability must be curated.
- **Live-only reasoning, not persisted (rejected):** drop reasoning before persistence to keep
  history lean. Rejected because persisting it matches how response text is already persisted, lets the
  user revisit thinking after reload, and is free of replay risk since `pruneReasoningForReplay`
  already strips reasoning from the model-facing prompt. The posture is persist-but-prune.
- **Server-resolved effort + data-driven registry, persist-but-prune (chosen):** the server resolves
  `conversation override, else connection override, else global` and, when the effort is not `off`,
  consults `reasoningCapabilityFor(type, model)` for an effort-aware enable. Thin clients, one source
  of truth, one place to evolve the policy.

## Consequences

- A `ReasoningEffort` enum (`off | low | medium | high`, plus `inherit` on override layers) is the
  single shared notion of "how much thinking". It replaces a separate on/off boolean; `off` is simply
  the lowest effort.
- New server modules: `apps/server/src/models/reasoning-capability.ts` (the lookup) and
  `reasoning-rules.ts` (the one-rule-per-model data table, first match wins, conservative default),
  plus `apps/server/src/chat/resolve-reasoning.ts` (the cascade + capability resolver). The chat layer
  applies the resulting tagged enable (`provider-options`, `unified`, or `middleware`) and sets
  `sendReasoning`.
- Contract additions, each strictly Zod-validated in both directions: global and
  per-connection `reasoningEffort` (settings, part of the v1 baseline schema), a per-conversation
  `reasoningOverride` (conversation persistence + a set-override endpoint), `capabilities.reasoning`
  on the models endpoint, and `reasoningMs` on `MessageMetadataSchema`.
- The composer control and Alt+T write the per-conversation override; the send path awaits that write
  before sending, so the server reads the updated effort with no toggle-then-send race.
- Cloud providers are gated, with Anthropic and Google requiring the most conservative matching.
  As built for the cloud providers: OpenAI and Azure-OpenAI send `reasoningEffort` ONLY (no reasoning summary,
  which OpenAI gates behind organization verification and hard-fails for unverified orgs); Azure
  reasoning options use the `azure` namespace, and Azure DeepSeek/Kimi deployments (which emit
  `reasoning_content`) route to the `azure.deepseek()` factory at model resolution.
- Local (openai-compatible) reasoning uses a COMBINED enable rather than a bare
  middleware: a lean enable-body sent through the official providerOptions passthrough
  (`reasoningEffort` -> `reasoning_effort`, plus `chat_template_kwargs: { enable_thinking }`) AND the
  `extractReasoningMiddleware({ tagName: 'think' })` wrap, applied in the same turn. Parsing relies on
  `@ai-sdk/openai-compatible` natively reading `reasoning_content ?? reasoning`, with the middleware
  as the inline-`<think>` fallback -- so it works across LM Studio, KoboldCPP, llama.cpp, Ollama, and
  JAN without per-model gating. Local `off` ACTIVELY suppresses (`reasoning_effort: "none"`,
  `enable_thinking: false`) because some local servers default thinking on. Strict-server resilience
  is a user-recoverable per-connection `sendThinkingParams` toggle (default on; when off, the only
  non-standard field `chat_template_kwargs` is omitted and the standard `reasoning_effort` plus the
  middleware remain), with an actionable error hint on a local-reasoning 400 -- chosen over a fragile
  transparent stream-retry. Rationale and the verified-source details were captured during the
  local-provider reasoning design discussion. Trade-off: enabling is best-effort (it also depends
  on operator server flags such as `--jinja`), accepted because the dual-layer parse catches reasoning
  however a correctly-configured server returns it, and the alternatives (a custom fetch wrapper or a
  new `@ai-sdk/deepseek` dependency) add complexity the native provider already covers.
- Per-conversation override persistence uses a SEGREGATED port: `ConversationStore` (load/save) is unchanged; a narrow `ReasoningOverrideStore` carries the two override methods; the one Drizzle adapter implements both, and only the chat and conversation routes depend on the intersection. This keeps the override cohesive with the conversation (same row) while satisfying interface segregation and leaving the existing store, its logging decorator, and fakes untouched.
- Adding a newly released reasoning model is a one-line edit to `reasoning-rules.ts`. Per-model and
  per-assistant effort, and the full Anthropic constraint reconciliation, are deferred to the later
  generation parameters, which plug into the same registry `enable`.
