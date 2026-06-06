import { SettingsResponseSchema } from '@anvika/shared/settings/contracts';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { apiPatch } from '../lib/api-client';
import { queryClient } from '../lib/queryClient';
import { modelsQueryKey } from '../hooks/conversation/useModels';
import { notify } from '../notifications/notifier';
import { classifyPatchError } from './patchOutcome';
import type { SingleFlight } from './singleFlight';
import type { PatchOptions, SettingsState } from './settingsStore';

/**
 * Delay before the "Settings saved" confirmation is announced, so a just-changed control's own value
 * announcement (e.g. a `<select>` reading the chosen option) is spoken first - otherwise the fast
 * localhost PATCH lets the confirmation race ahead of it. Tune up if it still races.
 */
export const SAVE_CONFIRM_DELAY_MS = 600;

/** Store accessors the patch action closes over (zustand `get`/`set`). */
export interface PatchActionDeps {
  /** Read the current store state. */
  get: () => SettingsState;
  /**
   * Apply a partial state update. Deliberately narrowed to the partial-object form of zustand's `set`
   * (the patch action only ever merges object literals); the updater-function and replace overloads
   * are intentionally not exposed, so do not widen this to the full zustand signature.
   */
  set: (partial: Partial<SettingsState>) => void;
}

/**
 * Run one settings PATCH: optimistic update, network commit, then reconcile from the authoritative
 * redacted response or roll back on failure. Because the caller serializes invocations
 * through a single-flight queue, the `previous` snapshot always reflects settled state, so a failed
 * commit can no longer roll back over a newer successful one.
 */
async function runPatch(
  deps: PatchActionDeps,
  wirePatch: Record<string, unknown>,
  optimistic: (settings: RedactedSettings) => RedactedSettings,
  options?: PatchOptions,
): Promise<boolean> {
  const { get, set } = deps;
  const announce = options?.announce ?? true;
  const previous = get().settings;
  if (!previous) return false;
  set({ settings: optimistic(previous), error: null, fieldErrors: {} });
  try {
    const body = await apiPatch('/api/v1/settings', wirePatch, SettingsResponseSchema);
    set({ version: body.version, settings: body.settings });
    if (announce) {
      setTimeout(() => notify({ type: 'settingsSaved' }), SAVE_CONFIRM_DELAY_MS);
    }
    // A `connections` save refreshes GET /api/v1/models; `skipModelsInvalidation` defers it.
    if ('connections' in wirePatch && !options?.skipModelsInvalidation) {
      void queryClient.invalidateQueries({ queryKey: modelsQueryKey });
    }
    return true;
  } catch (err) {
    const outcome = classifyPatchError(err);
    // Invalid on-disk file: revert the optimistic change and arm the overwrite prompt (no save
    // failure recorded) so the user can explicitly replace the bad file (the UI confirms).
    if (outcome.kind === 'file-invalid') {
      // Thread the content-safe label; conditional spread satisfies exactOptionalPropertyTypes.
      const label = options?.pendingSecretLabel;
      const prompt = { wirePatch, optimistic, ...(label ? { pendingSecretLabel: label } : {}) };
      set({ settings: previous, invalidFilePrompt: prompt });
      return false;
    }
    // Any other failure records the error and per-field messages (empty when none mapped), then
    // speaks the single summary line once (ADR 0015). Validation issues drive per-field text.
    set({ settings: previous, error: outcome.message, fieldErrors: outcome.fieldErrors });
    notify({ type: 'settingsSaveFailed', message: outcome.spokenSummary });
    return false;
  }
}

/**
 * Build the `patch` store action on a shared single-flight queue: each commit runs only after
 * the previous one settles, so overlapping blur-driven commits apply in order and a failed PATCH
 * cannot roll back a newer successful update. The queue is shared with the other settings writers
 * (`refreshFxRate`, `confirmInvalidOverwrite`), so every server settings write is serialized.
 *
 * @param deps - The store's `get`/`set` accessors.
 * @param run - The shared single-flight runner the store created.
 * @returns The `patch` action.
 */
export function createPatchAction(
  deps: PatchActionDeps,
  run: SingleFlight,
): SettingsState['patch'] {
  return (wirePatch, optimistic, options) =>
    run(() => runPatch(deps, wirePatch, optimistic, options));
}
