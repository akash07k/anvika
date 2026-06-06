import type { ReasoningLevel } from '@anvika/shared/reasoning/effort';
import type { ConnectionType } from '@anvika/shared/settings/connection';

import { REASONING_RULES } from './reasoning-rules';

/**
 * How to enable reasoning for a matched model. The chat layer applies exactly one variant.
 * The `local` kind is built by `resolveReasoning` (not by the capability registry) because only
 * the resolver knows the connection id and `sendThinkingParams` needed to key the body correctly.
 */
export type ReasoningEnable =
  | { kind: 'provider-options'; providerOptions: Record<string, unknown> }
  | { kind: 'unified'; reasoning: ReasoningLevel }
  | { kind: 'middleware'; tagName: string }
  | { kind: 'local'; providerOptions: Record<string, unknown>; tagName: string };

/** The result of a capability lookup. `supported: false` means send nothing. */
export type ReasoningCapability =
  | { supported: false }
  | { supported: true; enable: (effort: ReasoningLevel) => ReasoningEnable };

/**
 * Resolve whether reasoning is supported for a (connection type, model) pair and, when it is, an
 * effort-aware `enable(effort)` builder. Returns `{ supported: false }` for any unmatched pair
 * (conservative: an unknown model never receives provider options that could error a turn).
 * `openai-compatible` always returns the harmless `extractReasoningMiddleware` enable.
 *
 * @param type - The connection type (mapped from the model-id prefix upstream).
 * @param model - The provider-native model id (everything after the first colon).
 * @returns The reasoning capability for that pair.
 */
export function reasoningCapabilityFor(type: ConnectionType, model: string): ReasoningCapability {
  if (type === 'openai-compatible') {
    return { supported: true, enable: () => ({ kind: 'middleware', tagName: 'think' }) };
  }
  for (const rule of REASONING_RULES[type] ?? []) {
    if (rule.match(model)) return { supported: true, enable: rule.enable };
  }
  return { supported: false };
}
