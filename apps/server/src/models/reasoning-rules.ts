import type { ReasoningLevel } from '@anvika/shared/reasoning/effort';
import type { ConnectionType } from '@anvika/shared/settings/connection';

import type { ReasoningEnable } from './reasoning-capability';

/** One data rule: match a provider-native model id, then how to enable reasoning at an effort. */
export interface ReasoningRule {
  /** Match the provider-native model id (everything after the first colon). */
  match: (model: string) => boolean;
  /** Build the enable for a non-off effort. Effort-aware so the level threads through. */
  enable: (effort: ReasoningLevel) => ReasoningEnable;
}

/**
 * Per-effort Anthropic / Google 2.5 thinking-token budgets (research-doc mapping). INVARIANT: every
 * budget must stay below the smallest reasoning model's OUTPUT cap (Claude 4 family caps run
 * 32000 to 128000; Gemini 2.5 Flash 24576, Pro 32768), which these satisfy with wide margin. The
 * Anthropic provider adds the budget on top of max-output and clamps, so `budget < maxTokens` holds
 * by construction; we only owe `budget < the model's output cap`. A future `xhigh` effort would add
 * one entry here (and one enum member) and must respect the same invariant.
 */
const BUDGET_TOKENS: Record<ReasoningLevel, number> = { low: 2048, medium: 8192, high: 16384 };

/** @internal A model id starts with `prefix`. */
const idStartsWith = (prefix: string) => (model: string) => model.startsWith(prefix);

/** @internal A model id contains `sub`. */
const idIncludes = (sub: string) => (model: string) => model.includes(sub);

/** @internal A model id contains `sub`, case-insensitively (Azure deployment names are arbitrary case). */
const idIncludesCi = (sub: string) => (model: string) => model.toLowerCase().includes(sub);

/**
 * @internal A model id carries `sub` as a segment prefix, case-insensitively: either the id starts
 * with it, or it follows a `-`/`_`/`/`/`.` separator. Azure deployment names are operator-chosen, so
 * a bare substring match on a short token like `o3`/`o4` would mis-fire (e.g. a name containing
 * `proto4` or `gpt-4o`); anchoring to a segment boundary avoids classifying a non-reasoning
 * deployment as reasoning, which would send unsupported provider options and error the turn.
 */
const idHasSegmentCi = (sub: string) => (model: string) => {
  const lower = model.toLowerCase();
  return (
    lower.startsWith(sub) || ['-', '_', '/', '.'].some((sep) => lower.includes(`${sep}${sub}`))
  );
};

/**
 * Whether an Azure deployment name denotes a model that emits the OpenAI-compatible `reasoning_content`
 * field (DeepSeek-V4, Kimi K2, and similar). These are routed to the `azure.deepseek()` factory at model
 * resolution - a generic reasoning_content chat model - so their reasoning is parsed. Matched
 * case-insensitively because Azure deployment names are operator-chosen. Add new families here (and
 * they are covered by both the capability rule and the resolution routing in one edit).
 *
 * @param model - The Azure deployment name (the provider-native model id).
 * @returns True when the deployment emits `reasoning_content`.
 */
export const isAzureReasoningContentDeployment = (model: string): boolean =>
  idIncludesCi('deepseek')(model) || idIncludesCi('kimi')(model);

/**
 * @internal The OpenAI enable: reasoning EFFORT only. We deliberately do NOT request a
 * `reasoningSummary`: OpenAI gates reasoning summaries behind ORGANIZATION VERIFICATION and returns
 * a hard `AI_APICallError` ("Your organization must be verified to generate reasoning summaries")
 * for unverified orgs, which would fail the whole turn. Sending only `reasoningEffort` lets the model
 * reason internally and answer for every org; the visible OpenAI trace (the summary) becomes a
 * verified-org opt-in in a later phase. `reasoningEffort` alone needs no verification.
 */
const openaiEnable = (effort: ReasoningLevel): ReasoningEnable => ({
  kind: 'provider-options',
  providerOptions: { openai: { reasoningEffort: effort } },
});

/**
 * @internal Azure OpenAI (Responses API) reasoning enable: reasoning EFFORT only, under the azure
 * namespace. Same rationale as {@link openaiEnable}: the summary is gated behind org verification and
 * would hard-fail unverified orgs, so it is not requested.
 */
const azureOpenaiEnable = (effort: ReasoningLevel): ReasoningEnable => ({
  kind: 'provider-options',
  providerOptions: { azure: { reasoningEffort: effort } },
});

/** @internal Azure reasoning_content reasoning enable: reasoningEffort only (sent as reasoning_effort), azure namespace. */
const azureReasoningContentEnable = (effort: ReasoningLevel): ReasoningEnable => ({
  kind: 'provider-options',
  providerOptions: { azure: { reasoningEffort: effort } },
});

/**
 * Per-provider reasoning rules, ordered (first match wins). Adding a newly released reasoning
 * model is a one-line edit here. Conservative: anything not listed gets no reasoning.
 * `openai-compatible` is handled in the lookup (always-on middleware) and is intentionally absent.
 * Anthropic and Google MUST gate (a false positive errors the turn); OpenAI/Azure are treated as
 * gated; OpenRouter matches the upstream family carried in its id.
 */
export const REASONING_RULES: Partial<Record<ConnectionType, readonly ReasoningRule[]>> = {
  anthropic: [
    {
      match: (m) =>
        m.startsWith('claude-opus-4') ||
        m.startsWith('claude-sonnet-4') ||
        m.startsWith('claude-haiku-4'),
      enable: (effort) => ({
        kind: 'provider-options',
        providerOptions: {
          anthropic: { thinking: { type: 'enabled', budgetTokens: BUDGET_TOKENS[effort] } },
        },
      }),
    },
  ],
  openai: [
    {
      match: (m) => m.startsWith('gpt-5') || m.startsWith('o3') || m.startsWith('o4'),
      enable: openaiEnable,
    },
  ],
  azure: [
    // Azure reasoning_content deployments (DeepSeek, Kimi): the azure.deepseek() factory parses
    // `reasoning_content`; pass `reasoning_effort` under the azure provider-options namespace.
    { match: isAzureReasoningContentDeployment, enable: azureReasoningContentEnable },
    // Azure OpenAI gpt/o reasoning deployments (Responses API): effort + summary, azure namespace.
    // Segment-anchored so a deployment name merely containing `o3`/`o4` (e.g. `gpt-4o`, `proto4`) is
    // not mis-classified as a reasoning model and sent unsupported options.
    {
      match: (m) =>
        idHasSegmentCi('gpt-5')(m) || idHasSegmentCi('o3')(m) || idHasSegmentCi('o4')(m),
      enable: azureOpenaiEnable,
    },
  ],
  google: [
    {
      // Rolling alias: currently resolves to Gemini 3.x Pro, which rejects `medium` thinkingLevel.
      // Rolling aliases track the newest generation, so this target may change; revisit if a future
      // Gemini generation drops the unified `thinkingLevel`. See docs/research/reasoning-streaming.md.
      match: (m) => m === 'gemini-pro-latest',
      enable: (effort) => ({ kind: 'unified', reasoning: effort === 'medium' ? 'high' : effort }),
    },
    {
      // Rolling aliases: currently resolve to Gemini 3.x Flash / Flash-Lite (accept all levels).
      match: (m) => m === 'gemini-flash-latest' || m === 'gemini-flash-lite-latest',
      enable: (effort) => ({ kind: 'unified', reasoning: effort }),
    },
    {
      // Gemini 3 Pro accepts only `low` and `high` thinkingLevel (Flash also accepts `medium`); a
      // `medium` thinkingLevel errors a Pro turn. Round the middle effort up to `high` so a
      // default-effort (medium) Pro turn still thinks rather than failing. Must precede the generic
      // gemini-3 rule (first match wins).
      match: (m) => idStartsWith('gemini-3')(m) && m.includes('pro'),
      enable: (effort) => ({ kind: 'unified', reasoning: effort === 'medium' ? 'high' : effort }),
    },
    {
      match: idStartsWith('gemini-3'),
      enable: (effort) => ({ kind: 'unified', reasoning: effort }),
    },
    {
      match: idStartsWith('gemini-2.5'),
      enable: (effort) => ({
        kind: 'provider-options',
        providerOptions: {
          google: {
            thinkingConfig: { includeThoughts: true, thinkingBudget: BUDGET_TOKENS[effort] },
          },
        },
      }),
    },
  ],
  openrouter: [
    {
      match: (m) =>
        idIncludes('claude-opus-4')(m) ||
        idIncludes('claude-sonnet-4')(m) ||
        idIncludes('claude-haiku-4')(m) ||
        idIncludes('gpt-5')(m) ||
        idIncludes('o3')(m) ||
        idIncludes('deepseek-r1')(m) ||
        idIncludes('gemini-3')(m),
      enable: (effort) => ({
        kind: 'provider-options',
        providerOptions: { openrouter: { reasoning: { effort } } },
      }),
    },
  ],
};
