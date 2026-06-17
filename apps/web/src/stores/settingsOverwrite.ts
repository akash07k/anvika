import type { SettingsResponse } from '@anvika/shared/settings/contracts';
import { SettingsResponseSchema } from '@anvika/shared/settings/contracts';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { apiPatch } from '../lib/api-client';
import { queryClient } from '../lib/queryClient';
import { modelsQueryKey } from '../hooks/conversation/useModels';
import { notify } from '../notifications/notifier';

/**
 * A blocked save awaiting an explicit overwrite: the wire patch that was rejected and the optimistic
 * projection used to apply it, so the overwrite can replay the exact same change.
 */
export interface InvalidFilePrompt {
  /** The partial update originally sent to the server (may carry a plaintext secret). */
  wirePatch: Record<string, unknown>;
  /** Projects the change onto the redacted settings (e.g. sets a secret's `{ isSet: true }`). */
  optimistic: (settings: RedactedSettings) => RedactedSettings;
  /**
   * The content-safe connection LABEL whose secret was NOT written because this with-secret save was
   * blocked by the invalid file. Present only on a with-secret connection save; when set, the
   * overwrite-confirm warns (via `connectionSaveFailed`) that the key still needs re-entering. This is
   * a label only - NEVER the secret/apiKey/header value, which never enters store state (crown jewel).
   */
  pendingSecretLabel?: string;
}

/** Side-effect callbacks the store supplies so this helper stays free of store/announce coupling. */
export interface OverwriteCallbacks {
  /** Announce the successful save ("Settings saved"), debounced exactly as the normal patch path. */
  announce: () => void;
  /** Reconcile `version`/`settings`/`recovered` from the authoritative response and clear the prompt. */
  reconcile: (body: SettingsResponse) => void;
  /** Dismiss the overwrite prompt without touching the current settings (used on a renewed failure). */
  clearPrompt: () => void;
}

/** The minimal store surface {@link overwriteCallbacks} needs: a partial-state setter and the debounce. */
export interface OverwriteStore {
  /** Patch the settings store state (Zustand's `set`). */
  set: (partial: {
    version?: number;
    settings?: RedactedSettings;
    recovered?: boolean;
    invalidFilePrompt?: InvalidFilePrompt | null;
  }) => void;
  /** Debounce delay before the "Settings saved" confirmation, matching the normal patch path. */
  saveConfirmDelayMs: number;
}

/**
 * Build the {@link OverwriteCallbacks} for {@link runInvalidOverwrite} from the store surface, keeping
 * the construction out of the store body (size/SRP). `reconcile` writes the authoritative response and
 * clears the prompt; `announce` debounces the generic save confirmation; `clearPrompt` dismisses it.
 *
 * @param store - The minimal store setter and debounce delay.
 * @returns The announce/reconcile/clearPrompt side effects.
 */
export function overwriteCallbacks(store: OverwriteStore): OverwriteCallbacks {
  return {
    announce: () => setTimeout(() => notify({ type: 'settingsSaved' }), store.saveConfirmDelayMs),
    reconcile: (body) =>
      store.set({
        version: body.version,
        settings: body.settings,
        recovered: body.recovered,
        invalidFilePrompt: null,
      }),
    clearPrompt: () => store.set({ invalidFilePrompt: null }),
  };
}

/**
 * Replay a blocked save against `PATCH /api/v1/settings?overwriteInvalid=true`, replacing the invalid
 * on-disk file. On success it reconciles the store from the server response and refreshes the models
 * query when a connection changed. It then announces: for a with-secret connection save (the prompt
 * carries `pendingSecretLabel`) it speaks `connectionSaveFailed` for that label - the secret was never
 * written, so the user must re-enter it - INSTEAD OF the generic save confirmation; otherwise it speaks
 * the normal save confirmation. A renewed failure speaks a content-safe failure notice and clears the
 * prompt so the user is never stuck.
 *
 * @param prompt - The blocked patch to replay.
 * @param cb - The store-supplied announce/reconcile/clear side effects.
 */
export async function runInvalidOverwrite(
  prompt: InvalidFilePrompt,
  cb: OverwriteCallbacks,
): Promise<void> {
  try {
    const body = await apiPatch(
      '/api/v1/settings?overwriteInvalid=true',
      prompt.wirePatch,
      SettingsResponseSchema,
    );
    cb.reconcile(body);
    if ('connections' in prompt.wirePatch) {
      void queryClient.invalidateQueries({ queryKey: modelsQueryKey });
    }
    if (prompt.pendingSecretLabel) {
      // This overwrite replayed only the PUBLIC connections PATCH; the secret was never written
      // (it lived in the lost form draft). Speak the same partial-failure notice the normal flow uses
      // when the public config saved but the secret PUT did not, so the user knows to re-enter the key.
      // This REPLACES the generic "Settings saved" - speaking both would contradict.
      notify({ type: 'connectionSaveFailed', label: prompt.pendingSecretLabel });
    } else {
      cb.announce();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save settings';
    notify({ type: 'settingsSaveFailed', message });
    cb.clearPrompt();
  }
}
