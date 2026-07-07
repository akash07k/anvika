import { isReasoningUIPart, type UIMessage } from 'ai';

import type { ReasoningEffort, ReasoningEffortOverride } from '@anvika/shared/reasoning/effort';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { apiPatchNoContent } from '../api-client';
import type { SelectOption } from '../../components/fields/SelectField';

/**
 * Reasoning ("thinking") helpers for the web client: reading reasoning content off a message,
 * resolving and toggling the per-conversation reasoning-effort override, the effort select options,
 * and the id-scoped override writer. One module for everything the UI needs to read, present, and
 * persist a conversation's reasoning effort.
 */

/**
 * Concatenate the reasoning ("thinking") parts of a message into a single plain string, the
 * analogue of {@link textOf} for the reasoning channel. Reasoning text is RESPONSE CONTENT: this
 * string feeds only the on-screen Thinking region and its Copy button, and is never logged or
 * announced.
 *
 * @param message - The message whose reasoning parts are concatenated (assistant turns carry them).
 * @returns The joined reasoning text, or an empty string when the message has no reasoning parts.
 */
export function reasoningTextOf(message: UIMessage): string {
  return message.parts.map((part) => (isReasoningUIPart(part) ? part.text : '')).join('');
}

/**
 * The effective baseline effort the conversation inherits when its override is `inherit`: the active
 * connection's effort when that is not `inherit`, otherwise the global `reasoningEffort` (default
 * `medium` when settings are absent). Content-safe (enums only).
 *
 * Uses `RedactedSettings` because the web layer receives the redacted GET view (secrets replaced with
 * `{ isSet }`); `reasoningEffort` is not a secret, so it is present and typed identically.
 *
 * @param settings - The current redacted settings, or null when settings have not yet hydrated.
 * @returns The resolved baseline {@link ReasoningEffort}.
 */
export function baselineEffort(settings: RedactedSettings | null): ReasoningEffort {
  const selected = settings?.selectedModelId ?? '';
  const connectionId = selected.split(':')[0];
  const connectionEffort =
    settings?.connections.find((c) => c.id === connectionId)?.reasoningEffort ?? 'inherit';
  if (connectionEffort !== 'inherit') return connectionEffort;
  return settings?.reasoningEffort ?? 'medium';
}

/**
 * Decide the next override and the effort to announce when Alt+T toggles thinking, given the current
 * override and the inherited baseline. Three cases: if thinking is effectively on, turn it off; if it
 * is off but the baseline is on, clear to `inherit` (restore the baseline rather than pin a level); if
 * both are off, turn on to `medium`.
 *
 * @param override - The current per-conversation override.
 * @param baseline - The resolved baseline from {@link baselineEffort}.
 * @returns The next override to persist and the effort to announce.
 */
export function toggleDecision(
  override: ReasoningEffortOverride,
  baseline: ReasoningEffort,
): { next: ReasoningEffortOverride; announced: ReasoningEffort } {
  const effective: ReasoningEffort = override !== 'inherit' ? override : baseline;
  if (effective !== 'off') return { next: 'off', announced: 'off' };
  if (baseline !== 'off') return { next: 'inherit', announced: baseline };
  return { next: 'medium', announced: 'medium' };
}

/**
 * The global thinking-effort select options. No `inherit` value here: the global settings layer is
 * the base and always resolves to a concrete effort.
 */
export const GLOBAL_EFFORT_OPTIONS: SelectOption[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

/**
 * The override-layer thinking-effort options, used on the per-connection and per-conversation
 * selects. `inherit` appears first so the default "fall through to the layer below" choice is
 * always at the top.
 */
export const OVERRIDE_EFFORT_OPTIONS: SelectOption[] = [
  { value: 'inherit', label: 'Inherit' },
  ...GLOBAL_EFFORT_OPTIONS,
];

/** A small stateful writer for the per-conversation reasoning override. */
export interface ReasoningOverrideWriter {
  /**
   * Persist the override (a concrete effort or `null` to inherit) for the writer's conversation id.
   * Fires immediately (no queue) at the id-scoped endpoint `PATCH /api/v1/conversations/:id/reasoning`,
   * which create-if-absents the row (so a draft persists on first write - no client-side create dance).
   * The raw promise it returns REJECTS on failure; the caller handles that (the hook notifies via
   * `reasoningOverrideSaveFailed`). A swallowed copy of the same promise is stored so `pending()`
   * can await the latest in-flight write for the send-ordering gate. When two writes are concurrent,
   * `pending()` awaits the latest and the server reads the final chosen value; a pathological
   * out-of-order completion is bounded to a single-user reload seed and self-corrects on the next
   * change.
   */
  write(value: ReasoningEffort | null): Promise<void>;
  /**
   * Await the latest in-flight write so the send path reads the updated effort before the chat
   * send. Always resolves (never rejects) -- the internal copy swallows the rejection so this gate
   * is always await-safe. Resolves immediately when no write is in flight.
   */
  pending(): Promise<void>;
}

/**
 * Build a {@link ReasoningOverrideWriter} bound to a single conversation id. The override write is
 * deliberately OUTSIDE the settings single-flight queue: that queue orders settings writes, not the
 * chat send. The send path instead awaits {@link ReasoningOverrideWriter.pending} so the server reads
 * the updated effort. The endpoint returns 204 (no body), so the write uses
 * {@link apiPatchNoContent} rather than a body-validating PATCH.
 *
 * @param conversationId - The conversation whose reasoning override this writer persists.
 * @returns A fresh writer (one per conversation surface).
 */
export function createReasoningOverrideWriter(conversationId: string): ReasoningOverrideWriter {
  let inFlight: Promise<void> = Promise.resolve();
  return {
    write(value) {
      const p = apiPatchNoContent(`/api/v1/conversations/${conversationId}/reasoning`, {
        reasoningOverride: value,
      });
      // Track the latest write; swallow rejection here so `pending` is await-safe (the control
      // reconciles to the server state via the conversation detail query on the next read).
      inFlight = p.catch(() => undefined);
      return p;
    },
    pending() {
      return inFlight;
    },
  };
}
