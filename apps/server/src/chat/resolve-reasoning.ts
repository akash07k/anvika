import type { ReasoningEffort, ReasoningLevel } from '@anvika/shared/reasoning/effort';
import type { Settings } from '@anvika/shared/settings/schema';

import { connectionTypeFor, parseModelId } from '../models/connection-type';
import { reasoningCapabilityFor, type ReasoningEnable } from '../models/reasoning-capability';

/**
 * The resolved reasoning decision the chat layer applies. When enabled it also carries the
 * content-safe `effort` the cascade resolved (an enum, never message text) so the chat route can log
 * which effort the turn ran at for diagnostics. When disabled, `suppress` may be present for local
 * (openai-compatible) connections: the body is sent to the model with reasoning off so it does not
 * produce a thinking region even when the model defaults to reasoning-on.
 */
export type ReasoningDecision =
  | { enabled: false; suppress?: { providerOptions: Record<string, unknown> } }
  | { enabled: true; effort: ReasoningLevel; enable: ReasoningEnable };

/** Inputs to {@link resolveReasoning}. */
export interface ResolveReasoningInput {
  /** The server-resolved namespaced `connectionId:model` id for the turn. */
  modelId: string;
  /** The validated settings (carries the global `reasoningEffort` and the connections). */
  settings: Settings;
  /** The per-conversation override, or null to inherit. Currently always passes null. */
  conversationOverride: ReasoningEffort | null;
}

/**
 * Build the openai-compatible reasoning request body, keyed by the connection id (the `name` the
 * provider was created with, which is how `@ai-sdk/openai-compatible` matches providerOptions).
 * `reasoning_effort` is a standard option; `chat_template_kwargs.enable_thinking` is the
 * Jinja-family thinking switch, included only when the connection opts in via `sendThinkingParams`.
 *
 * @param connectionId - The connection id that keys the providerOptions map.
 * @param effort - The resolved reasoning effort for this turn (may be `'off'` for suppress).
 * @param sendThinkingParams - Whether to include the Jinja-family `chat_template_kwargs` toggle.
 * @returns A providerOptions map keyed by `connectionId`.
 */
export function localReasoningProviderOptions(
  connectionId: string,
  effort: ReasoningEffort,
  sendThinkingParams: boolean,
): Record<string, unknown> {
  const on = effort !== 'off';
  const body: Record<string, unknown> = { reasoning_effort: on ? effort : 'none' };
  if (sendThinkingParams) body['chat_template_kwargs'] = { enable_thinking: on };
  return { [connectionId]: body };
}

/**
 * Resolve the reasoning decision for a turn: the effort cascade (conversation, else connection,
 * else global) gated by the model's capability registry. Pure over already-validated inputs (no
 * Zod, not a trust boundary), content-safe (reads ids and enums, never message text). When the
 * effective effort is `off`, or the model id is unparseable/unknown, or the model is not
 * reasoning-capable, returns `{ enabled: false }`; otherwise `{ enabled: true, enable }` carrying
 * the registry's effort-aware enable. For `openai-compatible` connections the `local` kind is
 * returned directly (keyed by connection id) rather than the registry's `middleware` enable.
 *
 * @param input - The model id, the validated settings, and the per-conversation override (or null).
 * @returns The reasoning decision for the turn.
 */
export function resolveReasoning(input: ResolveReasoningInput): ReasoningDecision {
  const parsed = parseModelId(input.modelId);
  if (parsed === null) return { enabled: false };
  const type = connectionTypeFor(input.settings, parsed.connectionId);
  if (type === null) return { enabled: false };

  const connection = input.settings.connections.find((c) => c.id === parsed.connectionId);
  const connEffort = connection?.reasoningEffort ?? 'inherit';
  const fromConn: ReasoningEffort | null = connEffort === 'inherit' ? null : connEffort;
  const effective = input.conversationOverride ?? fromConn ?? input.settings.reasoningEffort;
  const isLocal = type === 'openai-compatible';
  const sendThinkingParams =
    connection?.type === 'openai-compatible' ? connection.sendThinkingParams : true;

  if (effective === 'off') {
    if (isLocal) {
      return {
        enabled: false,
        suppress: {
          providerOptions: localReasoningProviderOptions(
            parsed.connectionId,
            'off',
            sendThinkingParams,
          ),
        },
      };
    }
    return { enabled: false };
  }

  const cap = reasoningCapabilityFor(type, parsed.model);
  if (!cap.supported) return { enabled: false };

  if (isLocal) {
    return {
      enabled: true,
      effort: effective,
      enable: {
        kind: 'local',
        providerOptions: localReasoningProviderOptions(
          parsed.connectionId,
          effective,
          sendThinkingParams,
        ),
        tagName: 'think',
      },
    };
  }

  // `effective` is narrowed to a non-off ReasoningLevel by the `off` guard above.
  return { enabled: true, effort: effective, enable: cap.enable(effective) };
}
