# Streaming Reasoning/Thinking Across AI Providers

Context7 library used: `/vercel/ai` (Vercel AI SDK, source reputation: High). Web
search used to confirm current (mid-2026) model availability and provider-side
reasoning controls. Date: 2026-06-15.

Scope: documentation research for streaming reasoning-model thinking via
`sendReasoning`. This file describes how to ASK each provider for reasoning and how it
arrives in the AI SDK stream. It does not change application source. Anything not
firmly confirmed is marked "uncertain" rather than guessed.

Verified facts this doc builds on (given, not re-derived):

- The app uses `ai@6.0.197` with `streamText` plus `toUIMessageStreamResponse`.
  Installed provider packages (from `apps/server/package.json`): `@ai-sdk/anthropic`,
  `@ai-sdk/azure`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`,
  `@ai-sdk/xai`, and `@openrouter/ai-sdk-provider`. So every supported provider has a
  dedicated package; nothing here needs openai-compatible as a fallback for Azure or
  OpenRouter.
- `toUIMessageStreamResponse({ sendReasoning: true })` forwards reasoning parts to the
  client. Reasoning is NOT emitted unless the provider is asked for it.
- The `ReasoningUIPart` shape is `{ type: 'reasoning', text: string, state?:
  'streaming' | 'done', providerMetadata?: Record<string, unknown> }`.
- For local openai-compatible, `@ai-sdk/openai-compatible` natively parses
  `reasoning_content` and `reasoning` JSON fields; inline `<think>...</think>` tag
  models need `wrapLanguageModel({ model, middleware: extractReasoningMiddleware({
  tagName: 'think' }) })`, which is harmless when no tags are present.
- Replay pruning already exists (`pruneReasoningForReplay` in
  `apps/server/src/chat/replay-sanitization.ts`, invoked from `stream-chat.ts`); persisted
  history is untouched, and reasoning is stripped from the model-facing prompt on
  replay.

Anvika model-id model: a model id is namespaced `connectionId:model`. The connection
id is NOT a provider name; `connectionTypeFor(settings, connectionId)` maps it to a
`ConnectionType` (one of `anthropic`, `openai`, `google`, `xai`, `openrouter`,
`azure`, `openai-compatible`). Any capability gating must resolve the connection TYPE
first, then inspect the provider-native model id (everything after the first colon).

## Summary

- Reasoning is opt-in per provider. None of the providers emit reasoning unless we
  send the right `providerOptions.<namespace>` block (or, for AI SDK v6, the unified
  top-level `reasoning` parameter). With nothing sent, even a reasoning-capable model
  stays silent about its thinking.
- The AI SDK v6 added a UNIFIED top-level `reasoning` parameter on `streamText`
  (for example `reasoning: 'high'`). It maps to each provider's native control. This
  is the simplest enable path and is provider-agnostic, but the per-provider
  `providerOptions` objects give finer control (summary verbosity, explicit token
  budgets) and are what we should key the registry on for provider-specific nuances.
- Id-gating requirement varies by provider, and this is the central design decision:
  - Anthropic: MUST id-gate. Sending `thinking: { type: 'enabled', ... }` to a
    non-thinking model errors the turn. Conservative matching is mandatory.
  - OpenAI: largely safe but version-sensitive. `reasoningEffort`/`reasoningSummary`
    are accepted by current reasoning models; sending a summary request to a plain
    chat model (for example a hypothetical non-reasoning model) is at best ignored and
    at worst rejected. Treat as id-gated to be safe.
  - Google: MUST id/parameter-gate by model generation. The control changed shape
    between generations (`thinkingBudget` for 2.5-era, `thinkingLevel` for 3-era), so
    sending the wrong-shaped option to the wrong generation can error.
  - Azure (OpenAI on Azure): same `@ai-sdk/openai` option namespace and the same
    id-gating concerns as OpenAI; additionally the deployment name is user-chosen, so
    we often cannot infer the underlying model from the id. Treat as id-gated but
    expect lower match confidence; default to no reasoning when unsure.
  - OpenRouter: accept-or-ignore in practice. OpenRouter normalizes a unified
    `reasoning` request field and silently drops it for models that do not support it.
    Lowest gating need; still gate to avoid wasted/Charged thinking on models that DO
    support it but where the user did not want it.
  - Local openai-compatible: accept-or-ignore. We cannot know the served model, so we
    never send provider-native thinking options; we only enable the SDK's
    reasoning-parsing path (native fields, optionally the `<think>` middleware). No
    id-gating; always-on parsing is safe.
- Reasoning text is response content. It must NEVER be logged by default (same rule as
  prompt/response text). Reasoning token counts are content-safe and may be logged.

## OpenAI

Connection type: `openai`. Package: `@ai-sdk/openai`. In the AI SDK the `openai()`
factory defaults to the Responses API; `openai.chat(...)` selects Chat Completions.

Current reasoning-capable model families (confirmed mid-2026):

- GPT-5 series (the reasoning-capable default family in 2026; for example `gpt-5`,
  and point releases such as `gpt-5.2` appearing in current SDK docs). GPT-5 always
  applies a reasoning layer.
- o-series reasoning models: `o3`, `o4-mini` (note: `o3` is on a sunset path, retiring
  from ChatGPT around 2026-08-26 per OpenAI release notes; the API lifecycle may
  differ, so treat specific o-series ids as time-sensitive).
- Non-reasoning chat models such as `gpt-4o` exist and do NOT do reasoning.

Exact AI SDK v6 mechanism:

```ts
import { openai, type OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';
import { streamText } from 'ai';

const result = streamText({
  model: openai('gpt-5.2'), // Responses API by default
  prompt: '...',
  providerOptions: {
    openai: {
      // 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
      reasoningEffort: 'medium',
      // 'auto' | 'detailed' - emits a human-readable reasoning summary as reasoning parts
      reasoningSummary: 'detailed',
    } satisfies OpenAILanguageModelResponsesOptions,
  },
});
```

Key points:

- The reasoning SUMMARY (the visible thinking text) is a Responses-API feature. With
  the default `openai('...')` factory (Responses), `reasoningSummary` streams reasoning
  parts. The underlying raw reasoning is never exposed; only the summary is. So for
  Anvika to show thinking text, the OpenAI path should use the Responses API (which is
  the SDK default) and set `reasoningSummary`.
- `reasoningEffort` controls how much the model thinks (cost/latency lever). It does
  not by itself produce visible summary text; pair it with `reasoningSummary` to show
  thinking.
- NOTE (implementation decision): OpenAI gates the reasoning SUMMARY behind ORGANIZATION
  VERIFICATION. An unverified org gets a hard `AI_APICallError` ("Your organization must
  be verified to generate reasoning summaries") that fails the whole turn. So Anvika sends
  `reasoningEffort` ONLY (no `reasoningSummary`) for OpenAI and Azure-OpenAI reasoning
  models: the model still reasons internally and answers for every org, but no visible
  trace is shown. Surfacing the OpenAI/Azure-OpenAI trace for a verified org is a later
  opt-in. (DeepSeek/Kimi on Azure and Anthropic reasoning are NOT gated this way and DO
  stream a visible trace.)
- Reasoning token count: reported via `providerMetadata.openai.reasoningTokens` (and
  reflected in usage). Content-safe to log.

Non-reasoning model behavior: setting `reasoningSummary`/`reasoningEffort` on a plain
chat model (for example `gpt-4o`) is not a meaningful request; depending on the model
and API surface it is ignored or rejected. Treat OpenAI as ID-GATED: only send these
options when the resolved model id matches a known reasoning family. Unknown ids get no
reasoning options.

Cost/latency: reasoning effort directly increases reasoning token spend and latency.
Reasoning tokens are billed as output tokens. The visible summary is a condensed view;
the model is billed for the full underlying reasoning regardless of summary verbosity.

## Anthropic

Connection type: `anthropic`. Package: `@ai-sdk/anthropic`.

Current extended-thinking-capable models (confirmed mid-2026): Claude Opus 4.x (for
example Opus 4.6, 4.7, 4.8) and Claude Sonnet 4.x (for example Sonnet 4.5, 4.6), plus
Claude Haiku 4.5. Opus 4.x supports up to 128k output tokens for extended thinking;
Sonnet 4.6 and Haiku 4.5 up to 64k.

Exact AI SDK v6 mechanism (budget form, current for Sonnet 4.5-era ids):

```ts
import { anthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

const result = streamText({
  model: anthropic('claude-sonnet-4-5-20250929'),
  prompt: '...',
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 12000 },
    } satisfies AnthropicLanguageModelOptions,
  },
});
```

Important version nuance (uncertain at the AI SDK type level, confirmed at the
Anthropic API level): for the newest models (Opus 4.6, Sonnet 4.6 and later),
`budget_tokens` is DEPRECATED in favor of an adaptive form (`type: 'adaptive'`), and
Opus 4.8 adds effort controls (`low` / `high` / `xhigh` / `max`, default `high`). The
exact shape the `@ai-sdk/anthropic` provider-options type exposes for adaptive/effort on
these newest ids should be confirmed against the installed `@ai-sdk/anthropic` version
before implementation. Marked uncertain. The safe, broadly-supported control today is
`thinking: { type: 'enabled', budgetTokens: N }` on the 4.5-era ids.

Constraints (Anthropic extended thinking): when thinking is enabled, the budget must be
less than `maxTokens`, and Anthropic requires `temperature` to be unset/default (it does
not allow custom temperature with extended thinking). If Anvika later exposes
generation parameters, the registry/enable path must reconcile this: when
thinking is on, do not also send a custom temperature, and ensure `maxTokens >
budgetTokens`.

Non-reasoning model behavior: sending `thinking: { type: 'enabled', ... }` to a model
that does not support extended thinking ERRORS the request. Anthropic is the strictest
case. Anthropic MUST be ID-GATED with conservative matching; a false positive breaks the
turn.

How reasoning arrives: as `reasoning` stream parts (and `reasoningText`/`reasoning` on a
non-streaming result). Anthropic may also emit redacted/encrypted reasoning blocks;
these are still response content.

Reasoning token count: thinking tokens are reported in usage/providerMetadata
(content-safe). They are BILLED as output tokens; a 12k budget can add meaningful cost
and latency.

## Google (Gemini)

Connection type: `google`. Package: `@ai-sdk/google`.

Current thinking-capable models (confirmed mid-2026): Gemini 3 series (for example
`gemini-3-pro`, `gemini-3-flash`) and Gemini 2.5 series (for example
`gemini-2.5-flash`, `gemini-2.5-pro`), plus newer 3.x releases (3.1, 3.5). The control
parameter CHANGED between generations, which is the gating crux:

- Gemini 2.5-era: `thinkingConfig.thinkingBudget` (a token budget; `0` disables) plus
  `thinkingConfig.includeThoughts: true` to surface thoughts.
- Gemini 3-era: a `thinkingLevel` (low/high) replaces `thinkingBudget`. The "minimal"
  level is the closest equivalent to the old budget-0.

Exact AI SDK v6 mechanism (2.5-era / budget form):

```ts
import { google, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText } from 'ai';

const result = streamText({
  model: google('gemini-2.5-flash'),
  prompt: '...',
  providerOptions: {
    google: {
      thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
    } satisfies GoogleLanguageModelOptions,
  },
});
```

`includeThoughts: true` is what makes thoughts arrive as `reasoning` stream parts;
without it the model may still think but does not surface the text.

Non-reasoning/wrong-generation behavior: sending a 2.5-shaped `thinkingBudget` to a
3-era model (which expects `thinkingLevel`), or vice versa, can error or be ignored
depending on the field. Google MUST be GATED by model generation, not merely by "is it
Gemini". The registry rule for Google therefore needs per-generation entries that carry
the right option shape. Unknown Gemini ids get no thinking options.

Reasoning token count: thinking tokens are reported in usage. Content-safe to log.

Cost/latency: a larger `thinkingBudget` (or higher `thinkingLevel`) increases latency
and token spend; thinking tokens are billed.

Note on the unified parameter: the AI SDK v6 top-level `reasoning` parameter (for
example `reasoning: 'high'` with `model: 'google/gemini-3-flash-preview'`) abstracts
this generation difference. Using the unified parameter is the most future-proof way to
ask Google for reasoning without tracking the budget-vs-level shape ourselves; the
trade-off is less fine control. The registry can record "use unified reasoning" as the
Google rule for 3-era ids and fall back to explicit `thinkingConfig` only where finer
control is needed.

## Azure AI Foundry (Azure OpenAI)

Connection type: `azure`. Package: `@ai-sdk/azure`. The Azure provider is the
Azure-hosted variant of OpenAI and uses the same Responses API surface, but its reasoning
options ride the `providerOptions.azure` namespace (NOT `openai`): the `@ai-sdk/azure`
provider reads its options under the `azure` key. So `reasoningEffort` and
`reasoningSummary` apply with the same semantics as OpenAI, just under `azure`.

NOTE (corrected): an earlier draft of this section claimed Azure reused the `openai`
namespace and that there was no separate `azure` namespace. That was wrong. After the bump
to `@ai-sdk/azure@3.0.74` the implementation (`reasoning-rules.ts`) uses the `azure`
namespace, verified end-to-end against a live Azure AI Foundry endpoint.

```ts
import { createAzure } from '@ai-sdk/azure';
import { streamText } from 'ai';

const azure = createAzure({ resourceName: '...', apiKey: '...' });

const result = streamText({
  // For Azure, the "model" string is the DEPLOYMENT name chosen by the user.
  model: azure('my-gpt5-deployment'),
  prompt: '...',
  providerOptions: {
    azure: { reasoningSummary: 'detailed', reasoningEffort: 'medium' },
  },
});
```

Current Azure reasoning models: the GPT-5 series and o-series (o3, o1, o1-mini, o3-mini)
are available on Azure OpenAI / Foundry as reasoning models, per Microsoft Learn. Azure
also hosts `reasoning_content`-style reasoning models (DeepSeek-V4, Kimi K2); the
implementation routes those deployments to the `azure.deepseek()` factory so their
`reasoning_content` is parsed, and passes `reasoning_effort` under the same `azure`
namespace.

Gating crux for Azure: the model string is a user-chosen DEPLOYMENT name (for example
`prod-reasoner`), which does not reliably encode the underlying model id. So id-prefix
matching is unreliable for Azure. Recommendation: treat Azure as id-gated using the same
OpenAI rules where the deployment name happens to contain a recognizable token (for
example `gpt-5`, `o3`), but default to NO reasoning when the deployment name is opaque.
Better long-term: derive capability from model-discovery metadata (the models endpoint /
enrichment layer) rather than the id string. Marked: deployment-name opacity is the
main reason Azure reasoning detection is lower-confidence than direct OpenAI.

Non-reasoning behavior and cost/latency: same as OpenAI (summary requires Responses
API; reasoning tokens billed as output; effort drives cost/latency).

## OpenRouter

Connection type: `openrouter`. Package: `@openrouter/ai-sdk-provider` (dedicated; we do
NOT route OpenRouter through openai-compatible).

How OpenRouter exposes reasoning: OpenRouter normalizes a unified `reasoning` request
field across underlying providers (and a legacy boolean `include_reasoning`). Reasoning
tokens appear in the response `reasoning` field when the model supports it. If a model
does not support reasoning, OpenRouter silently drops the field. Reasoning tokens are
billed as output tokens when emitted.

Exact AI SDK mechanism (via the dedicated provider's `providerOptions.openrouter`):

```ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

const openrouter = createOpenRouter({ apiKey: '...' });

const result = streamText({
  model: openrouter('anthropic/claude-sonnet-4.5'),
  prompt: '...',
  providerOptions: {
    openrouter: {
      // OpenRouter's unified reasoning config. Either a token budget or an effort level,
      // depending on the underlying model. `exclude` can hide the reasoning text.
      reasoning: { max_tokens: 4096 },
      // or: reasoning: { effort: 'high' }
    },
  },
});
```

The provider also supports `extraBody` at provider-, model-, and request-level for
passthrough; `providerOptions.openrouter.reasoning` is the request-level form. The exact
TypeScript shape of the `reasoning` option object on the installed
`@openrouter/ai-sdk-provider@2.9.0` should be confirmed against that version before
implementation (marked uncertain at the precise-type level; the documented fields are
`effort`, `max_tokens`, and `exclude`).

Gating: lowest of all providers because OpenRouter silently ignores reasoning for
unsupported models. We can send the unified reasoning config more liberally. However,
because OpenRouter ids carry the upstream model (for example
`anthropic/claude-sonnet-4.5`, `openai/gpt-5`, `deepseek/deepseek-r1`), we CAN match on
the upstream family and choose whether to enable, to avoid charging for thinking on
models where the user did not ask for it. Recommendation: gate by the upstream-model
substring in the OpenRouter id, but treat a non-match as "send nothing" (safe) rather
than an error risk.

Reasoning arrival: as `reasoning` stream parts through the AI SDK provider.

## Local openai-compatible (LM Studio / Ollama / llama.cpp)

Connection type: `openai-compatible`. Package: `@ai-sdk/openai-compatible`.

We do not know which model a local server is running, and the user can swap it freely.
So we never send provider-native thinking options here. Two facts make local reasoning
work without any options:

- `@ai-sdk/openai-compatible` natively parses `reasoning_content` and `reasoning` JSON
  fields in the SSE stream and emits them as `reasoning` parts. Many local reasoning
  models (DeepSeek-R1 family, QwQ, etc., served via LM Studio/Ollama/llama.cpp) emit
  one of these fields.
- Models that instead emit inline `<think>...</think>` tags inside the text need
  `wrapLanguageModel({ model, middleware: extractReasoningMiddleware({ tagName:
  'think' }) })`. This middleware is HARMLESS when no tags are present (it is a no-op),
  so wrapping every local model is safe.

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';

const local = createOpenAICompatible({ name: 'local', baseURL: '...' });

const model = wrapLanguageModel({
  model: local('whatever-the-user-loaded'),
  middleware: extractReasoningMiddleware({ tagName: 'think' }),
});
// streamText({ model, ... }) - reasoning parts arrive whether the server emits
// reasoning_content/reasoning JSON fields OR inline <think> tags.
```

Gating: NONE. There are no provider-native options to send, so there is nothing to
gate. The registry rule for `openai-compatible` is simply: wrap with
`extractReasoningMiddleware({ tagName: 'think' })` and rely on native field parsing.
This is always safe.

Reasoning token count: a local server may or may not report reasoning token usage;
treat as best-effort/often-absent. Marked uncertain (server-dependent).

Cost/latency: no API billing (local), but reasoning still consumes local compute and
adds latency.

## Design recommendation: a data-driven reasoning capability registry

Goal: given a connection TYPE plus a resolved provider-native model id, return whether
reasoning is supported and how to enable it (provider options, or a middleware wrap, or
the unified parameter). Adding a newly released reasoning model must be a one-line data
edit, not new control flow. Unknown models gracefully get no reasoning (conservative).

Design principles applied:

- Conservative by default: an unmatched (provider type, model id) pair returns "no
  reasoning". A false positive can error a turn (Anthropic, wrong-generation Google),
  so we never send options unless a rule matches.
- One place per provider: each provider type has an ordered list of rules
  (exact-id, id-prefix, or a narrow regex). First match wins. Adding a model = adding a
  data entry.
- Separation of the "should we" (capability lookup) from the "how" (the option object).
  The lookup returns a tagged result the chat layer applies.

Where it lives: the pure capability data and the lookup function belong in
`apps/server/src/models/` (alongside `connection-type.ts`, `registry.ts`, `price.ts`)
because they are server-only and resolve against the AI SDK provider option shapes.
Reuse the existing `ConnectionType` from `@anvika/shared/settings/connection` and the
existing `parseModelId` / `connectionTypeFor` from `connection-type.ts` to get
`(type, model)`. No Zod is needed here: these are internal types over already-validated
settings, not a trust boundary. Keep the data table in its own file (under ~200 lines)
and the lookup in another, to respect the file-size cap.

Sketch (TypeScript, named exports, TSDoc, no `any`):

```ts
// apps/server/src/models/reasoning-capability.ts (types + lookup)
import type { ConnectionType } from '@anvika/shared/settings/connection';

/** How to enable reasoning for a matched model. The chat layer applies exactly one. */
export type ReasoningEnable =
  | { kind: 'provider-options'; providerOptions: Record<string, unknown> }
  | { kind: 'unified'; reasoning: 'low' | 'medium' | 'high' }
  | { kind: 'middleware'; tagName: string };

/** The result of a capability lookup. `supported: false` means send nothing. */
export type ReasoningCapability =
  | { supported: false }
  | { supported: true; enable: ReasoningEnable };

/** One data rule: match a provider-native model id, then how to enable reasoning. */
export interface ReasoningRule {
  /** Match the provider-native model id (after the first colon). */
  match: (model: string) => boolean;
  /** How to enable reasoning when this rule matches. */
  enable: ReasoningEnable;
}

/**
 * Resolve whether reasoning is supported for a (connection type, model) pair, and how
 * to enable it. Returns `{ supported: false }` for any unmatched pair (conservative:
 * an unknown model never receives provider options that could error a turn).
 *
 * @param type - The connection type (mapped from the model-id prefix upstream).
 * @param model - The provider-native model id (everything after the first colon).
 * @returns The reasoning capability for that pair.
 */
export function reasoningCapabilityFor(
  type: ConnectionType,
  model: string,
): ReasoningCapability {
  // openai-compatible: always wrap; no per-id data needed.
  if (type === 'openai-compatible') {
    return { supported: true, enable: { kind: 'middleware', tagName: 'think' } };
  }
  for (const rule of REASONING_RULES[type] ?? []) {
    if (rule.match(model)) return { supported: true, enable: rule.enable };
  }
  return { supported: false };
}
```

```ts
// apps/server/src/models/reasoning-rules.ts (the data table; edit this to add a model)
import type { ConnectionType } from '@anvika/shared/settings/connection';
import type { ReasoningRule } from './reasoning-capability';

/** Helpers keep each rule a one-liner. */
const idStartsWith = (prefix: string) => (model: string) => model.startsWith(prefix);
const idIncludes = (sub: string) => (model: string) => model.includes(sub);

/**
 * Per-provider reasoning rules, ordered (first match wins). Adding a newly released
 * reasoning model is a one-line edit here. Conservative: anything not listed gets no
 * reasoning. `openai-compatible` is handled in the lookup (always-on middleware) and is
 * intentionally absent here.
 */
export const REASONING_RULES: Partial<Record<ConnectionType, readonly ReasoningRule[]>> = {
  anthropic: [
    // Extended thinking; budget form is broadly supported on 4.5-era ids.
    {
      match: (m) => m.startsWith('claude-opus-4') || m.startsWith('claude-sonnet-4'),
      enable: {
        kind: 'provider-options',
        providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens: 12000 } } },
      },
    },
  ],
  openai: [
    {
      match: (m) => m.startsWith('gpt-5') || m.startsWith('o3') || m.startsWith('o4'),
      enable: {
        kind: 'provider-options',
        providerOptions: { openai: { reasoningSummary: 'detailed', reasoningEffort: 'medium' } },
      },
    },
  ],
  azure: [
    // Deployment names are user-chosen; only match when a known token is present.
    {
      match: (m) => idIncludes('gpt-5')(m) || idIncludes('o3')(m) || idIncludes('o4')(m),
      enable: {
        kind: 'provider-options',
        providerOptions: { openai: { reasoningSummary: 'detailed', reasoningEffort: 'medium' } },
      },
    },
  ],
  google: [
    // 3-era: prefer the unified parameter (abstracts thinkingLevel vs thinkingBudget).
    { match: idStartsWith('gemini-3'), enable: { kind: 'unified', reasoning: 'high' } },
    // 2.5-era: explicit thinkingConfig with includeThoughts to surface thoughts.
    {
      match: idStartsWith('gemini-2.5'),
      enable: {
        kind: 'provider-options',
        providerOptions: { google: { thinkingConfig: { thinkingBudget: 4096, includeThoughts: true } } },
      },
    },
  ],
  openrouter: [
    // OpenRouter ids carry the upstream model; match the upstream family.
    {
      match: (m) =>
        idIncludes('claude-opus-4')(m) ||
        idIncludes('claude-sonnet-4')(m) ||
        idIncludes('gpt-5')(m) ||
        idIncludes('o3')(m) ||
        idIncludes('deepseek-r1')(m) ||
        idIncludes('gemini-3')(m),
      enable: {
        kind: 'provider-options',
        providerOptions: { openrouter: { reasoning: { effort: 'high' } } },
      },
    },
  ],
};
```

How the chat layer uses it (sketch, not to be implemented here): in
`apps/server/src/chat`, after `resolve-model.ts` produces `(model, resolvedModelId,
settings)`, parse the id, map prefix to `ConnectionType`, call
`reasoningCapabilityFor(type, model)`, then:

- `kind: 'provider-options'`: spread into the `streamText({ providerOptions })`.
- `kind: 'unified'`: set `streamText({ reasoning })`.
- `kind: 'middleware'`: wrap the model with `extractReasoningMiddleware` BEFORE
  `streamText` (likely in `registry.ts`/`resolve-model.ts`, since wrapping is a model
  construction concern).

And `toUIMessageStreamResponse({ sendReasoning: true })` is set whenever reasoning was
enabled (or unconditionally, since it is harmless when no reasoning parts exist).

Why this is future-proof, robust, and extensible:

- Future-proof: a new reasoning model is one new entry in `REASONING_RULES` (or simply
  matched by an existing prefix rule, for example a new `gpt-5.x` already matches
  `startsWith('gpt-5')`).
- Robust: unmatched pairs return `{ supported: false }`, so no invalid option object is
  ever sent; Anthropic/Google false positives (the error-prone cases) are avoided by
  conservative prefix matching. Local always uses the harmless middleware.
- Extensible: each provider's rules live in one ordered list; per-provider nuance
  (Google's generation split, Azure's deployment opacity) is expressed as data, not
  branching control flow in the chat path.

Open consideration: budgets/effort are hardcoded in the sketch. When the app adds
user-configurable generation parameters, the `enable` object should become a function of
a small reasoning-settings input (for example a user-chosen effort), and the
Anthropic constraint (no custom temperature with thinking; `maxTokens > budgetTokens`)
must be enforced where options are assembled.

## Content-safety and persistence

- Reasoning text is RESPONSE CONTENT. It must never be logged by default, exactly like
  prompt and response text (the privacy rule in `AGENTS.md` and the logging standard).
  Only the content-free `--log-content` / `ANVIKA_LOG_CONTENT` opt-in may surface it in
  development, and even then it should be treated as message content, not metadata.
- Reasoning TOKEN COUNTS (for example
  `providerMetadata.openai.reasoningTokens`, Anthropic/Google thinking-token usage) are
  content-safe and may be logged and stamped into usage metadata, consistent with the
  existing `toUsageMetadata` stamping in `stream-chat.ts`.
- Persistence: reasoning parts are persisted with the assistant message (history is
  untouched), but `pruneReasoningForReplay` already strips reasoning from the
  model-facing prompt on replay, so a prior turn's thinking (and any prior provider's
  reasoning) never reaches the next model. The existing tests in
  `apps/server/src/chat/stream-chat-reasoning.test.ts` already assert this content-leak
  guard; enabling reasoning emission does not change the replay-pruning behavior.
- The error path persists incoming messages (so reasoning survives a retry), also
  already covered by existing tests.

## Sources

- AI SDK reasoning and provider options (Context7 `/vercel/ai`):
  - <https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/26-reasoning.mdx>
  - <https://github.com/vercel/ai/blob/main/content/docs/02-foundations/06-provider-options.mdx>
  - <https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx>
  - <https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/03-openai.mdx>
  - <https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/05-anthropic.mdx>
  - <https://github.com/vercel/ai/blob/main/content/providers/01-ai-sdk-providers/16-google-vertex.mdx>
- AI SDK OpenAI provider (reasoningSummary, Responses API): <https://ai-sdk.dev/providers/ai-sdk-providers/openai>
- OpenAI reasoning guides and models:
  - <https://developers.openai.com/api/docs/guides/reasoning>
  - <https://developers.openai.com/api/docs/models>
  - <https://openai.com/index/introducing-o3-and-o4-mini/>
  - <https://help.openai.com/en/articles/9624314-model-release-notes>
- Anthropic extended thinking and models:
  - <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
  - <https://platform.claude.com/docs/en/about-claude/models/overview>
  - <https://www.anthropic.com/news/claude-opus-4-6>
  - <https://www.anthropic.com/news/claude-sonnet-4-6>
- Google Gemini thinking models:
  - <https://ai.google.dev/gemini-api/docs/models>
  - <https://blog.google/products/gemini/gemini-3/>
  - <https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-pro>
- Azure OpenAI reasoning:
  - <https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning>
  - <https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses>
- OpenRouter reasoning tokens and unified API:
  - <https://openrouter.ai/docs/guides/best-practices/reasoning-tokens>
  - <https://openrouter.ai/docs/api/reference/parameters>
  - <https://www.npmjs.com/package/@openrouter/ai-sdk-provider>
  - <https://deepwiki.com/OpenRouterTeam/ai-sdk-provider/3-configuration-options>
