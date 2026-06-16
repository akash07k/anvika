import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  type LanguageModel,
  type streamText,
} from 'ai';

import type { ReasoningDecision } from './resolve-reasoning';

/**
 * The exact provider-options type {@link streamText} accepts, derived from its own signature so the
 * reasoning seam stays in lockstep with the installed SDK (`ai` does not re-export the underlying
 * `ProviderOptions`).
 */
export type StreamProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]['providerOptions']
>;

/**
 * Translate a resolved {@link ReasoningDecision} into the provider options to spread into the
 * `streamText` call, or `undefined` when the turn sends no reasoning options. SINGLE TRANSLATION
 * SEAM: the capability registry stays provider-agnostic and returns a portable
 * `{ kind: 'unified', reasoning: level }`; THIS function is the only place that knows it currently
 * maps to a Google provider option. When the AI SDK ships a native top-level `streamText({
 * reasoning })`, or a second provider adopts a portable level, change ONLY this function (and its
 * test) - the registry and rules table are untouched. A `provider-options` or `local` enable
 * carries our own JSON-serializable data (built from literal rule tables, never untrusted input),
 * adapted to the SDK's structural provider-options type at this single passthrough seam. A
 * `suppress` body (present when reasoning is disabled for a local model that needs an explicit
 * opt-out) is spread in the same way; `sendReasoning` remains false in that case.
 *
 * @param reasoning - The resolved reasoning decision for the turn.
 * @returns The provider options to spread into `streamText`, or `undefined` when none apply.
 */
export function reasoningProviderOptionsFor(
  reasoning: ReasoningDecision,
): StreamProviderOptions | undefined {
  if (!reasoning.enabled) {
    return reasoning.suppress?.providerOptions as StreamProviderOptions | undefined;
  }
  if (reasoning.enable.kind === 'provider-options' || reasoning.enable.kind === 'local') {
    return reasoning.enable.providerOptions as StreamProviderOptions;
  }
  if (reasoning.enable.kind === 'unified') {
    return {
      google: {
        thinkingConfig: { thinkingLevel: reasoning.enable.reasoning, includeThoughts: true },
      },
    };
  }
  return undefined;
}

/**
 * Apply a `middleware`- or `local`-kind reasoning enable by wrapping the model with the AI SDK's
 * `extractReasoningMiddleware`, so a local (openai-compatible) model that emits `<think>...</think>`
 * tags inline in its text has them lifted into real reasoning parts (then streamed to the client
 * because `sendReasoning` is set). The `local` kind also spreads a provider body via
 * {@link reasoningProviderOptionsFor} (e.g. `reasoning_effort` + `chat_template_kwargs`), so it
 * both wraps the model AND sends options. For every other decision (disabled, suppress,
 * provider-options, unified) the model is returned unchanged - those are applied via request
 * options only, not a model wrap. The wrap is purely structural; no reasoning text is read or
 * logged here.
 *
 * The `LanguageModel` union admits a bare model-id string and a legacy `v2` model; neither can be
 * wrapped, so both are returned as-is. In this codebase the chat layer always resolves a `v3` model
 * object, so the middleware branch applies. The `typeof` and `specificationVersion` checks narrow
 * the union to the `v3` model `wrapLanguageModel` accepts, with no unsafe cast.
 *
 * @param model - The resolved language model for the turn.
 * @param reasoning - The resolved reasoning decision.
 * @returns The model, wrapped with reasoning extraction for `middleware` or `local` enables.
 */
export function reasoningModelFor(
  model: LanguageModel,
  reasoning: ReasoningDecision,
): LanguageModel {
  if (
    reasoning.enabled &&
    (reasoning.enable.kind === 'middleware' || reasoning.enable.kind === 'local') &&
    typeof model !== 'string' &&
    model.specificationVersion === 'v3'
  ) {
    return wrapLanguageModel({
      model,
      middleware: extractReasoningMiddleware({ tagName: reasoning.enable.tagName }),
    });
  }
  return model;
}

/**
 * Whether the turn sent the non-standard `chat_template_kwargs` thinking switch to a local server.
 * Used to attach an actionable hint to a 400 (the server knows its own request shape; no provider
 * error text is parsed). Content-safe: inspects only our own enable structure.
 *
 * Covers both paths: the enabled local path (reasoning on) and the suppress path (reasoning off for
 * a local connection with `sendThinkingParams: true`). A turn with `sendThinkingParams: false` omits
 * `chat_template_kwargs` from both bodies and returns `false` on both paths.
 *
 * @param reasoning - The resolved reasoning decision for the turn.
 * @returns `true` when a local enable or suppress body carrying `chat_template_kwargs` was active.
 */
export function localThinkingParamsActive(reasoning: ReasoningDecision): boolean {
  const providerOptions = reasoning.enabled
    ? reasoning.enable.kind === 'local'
      ? reasoning.enable.providerOptions
      : undefined
    : reasoning.suppress?.providerOptions;
  if (!providerOptions) return false;
  return Object.values(providerOptions).some(
    (body) => typeof body === 'object' && body !== null && 'chat_template_kwargs' in body,
  );
}

/** A reasoning timer: records the first reasoning/text instants and yields the thinking gap. */
export interface ReasoningTimer {
  /** Record a streaming chunk's discriminant `type`; only `reasoning-delta`/`text-delta` matter. */
  record: (chunkType: string) => void;
  /** The non-negative ms gap between first reasoning and first text, or undefined if no thinking. */
  elapsedMs: () => number | undefined;
}

/**
 * Create a content-safe reasoning timer for one streaming turn. It records only the instants of the
 * first reasoning delta and the first text delta (never the delta text) so the thinking duration -
 * the gap between them - can be stamped on the finished assistant message. `record` is called for
 * every streamed chunk; `elapsedMs` returns the non-negative gap, or `undefined` when the turn did
 * not think before answering.
 *
 * @returns A {@link ReasoningTimer}.
 */
export function createReasoningTimer(): ReasoningTimer {
  let firstReasoningAt: number | undefined;
  let firstTextAt: number | undefined;
  return {
    record(chunkType) {
      if (chunkType === 'reasoning-delta' && firstReasoningAt === undefined) {
        firstReasoningAt = Date.now();
      }
      if (chunkType === 'text-delta' && firstTextAt === undefined) {
        firstTextAt = Date.now();
      }
    },
    elapsedMs() {
      return firstReasoningAt !== undefined && firstTextAt !== undefined
        ? Math.max(0, firstTextAt - firstReasoningAt)
        : undefined;
    },
  };
}
