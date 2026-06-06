import { create } from 'zustand';

import { SettingsResponseSchema } from '@anvika/shared/settings/contracts';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { logDiag } from '../diagnostics/logDiag';
import { apiGet } from '../lib/api-client';
import { queryClient } from '../lib/queryClient';
import { modelsQueryKey } from '../hooks/conversation/useModels';
import { notify } from '../notifications/notifier';
import { createPatchAction, SAVE_CONFIRM_DELAY_MS } from './settingsPatch';
import { refreshFxRate } from './settingsFxRefresh';
import {
  overwriteCallbacks,
  runInvalidOverwrite,
  type InvalidFilePrompt,
} from './settingsOverwrite';
import { createSingleFlight, type SingleFlight } from './singleFlight';

/** Options for {@link SettingsState.patch}. */
export interface PatchOptions {
  /**
   * Whether a successful commit announces "Settings saved" (defaults to `true`, so every user-driven
   * control confirms its save). Pass `false` for a silent commit (a connection PATCH
   * does, so only its own precise announcement speaks). A failure still records an error regardless.
   */
  announce?: boolean;
  /**
   * When `true`, a `connections` commit skips the models-query invalidation - the with-secret save
   * defers it to the secret PUT (the keyless public PATCH would invalidate prematurely and stale).
   */
  skipModelsInvalidation?: boolean;
  /**
   * A content-safe connection LABEL, set by a with-secret connection save so that if the public PATCH
   * is blocked by an invalid file, the overwrite-confirm can tell the user the key still needs to be
   * re-entered. Never a secret - only the label crosses into store state.
   */
  pendingSecretLabel?: string;
}

/** The settings store state and actions (Zustand for settings; a write-only channel for secrets). */
export interface SettingsState {
  /** Hydration status of the store. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** The schema version held by the client, or null before hydration. */
  version: number | null;
  /** The redacted settings (secrets are `{ isSet }`, never plaintext), or null before hydration. */
  settings: RedactedSettings | null;
  /** The most recent error message, or null. */
  error: string | null;
  /**
   * Per-field validation errors from the last rejected PATCH, keyed by the rendered field id
   * (ADR 0015). Empty when the last save succeeded or no field mapped; a non-empty map suppresses the
   * global summary so the per-field text is the single visible detail.
   */
  fieldErrors: Record<string, string>;
  /** True when the stored settings could not be read and defaults were substituted on the last load. */
  recovered: boolean;
  /** Resolved on-disk locations of the settings/secrets files, or null before hydration. */
  paths: { settings: string; secrets: string } | null;
  /** Set when a save was blocked by an invalid on-disk file; drives the confirm-overwrite dialog. */
  invalidFilePrompt: InvalidFilePrompt | null;
  /** Load the redacted settings once from `GET /api/v1/settings`. */
  hydrate: () => Promise<void>;
  /**
   * Re-read settings from disk on user request: re-hydrate, refresh the models query (provider
   * config may have changed underfoot), and confirm "Settings reloaded" - but only on a healthy
   * result, so a still-broken file does not contradict the degraded notice hydrate already spoke.
   */
  reload: () => Promise<void>;
  /**
   * Apply an optimistic update then PATCH it through. `wirePatch` is the partial update sent to the
   * server (it may carry a plaintext secret, which is never stored here); `optimistic` projects the
   * change onto the redacted settings (for a secret, set `{ isSet: true }`). On success the store
   * reconciles from the authoritative redacted response; on failure it restores the prior settings and
   * records the error. A `settings-file-invalid` rejection arms {@link invalidFilePrompt}
   * instead so the UI can offer an overwrite. `options` tunes announcement/invalidation (see
   * {@link PatchOptions}). Resolves `true` only on a successful commit, `false` otherwise; callers may
   * await it to sequence a follow-up (the secret PUT).
   */
  patch: (
    wirePatch: Record<string, unknown>,
    optimistic: (settings: RedactedSettings) => RedactedSettings,
    options?: PatchOptions,
  ) => Promise<boolean>;
  /** Refresh the stored USD-to-INR rate: reconcile the response and announce; see {@link refreshFxRate}. */
  refreshFxRate: () => Promise<void>;
  /** Re-run the blocked save with `overwriteInvalid=true`, replacing the invalid file on disk. */
  confirmInvalidOverwrite: () => Promise<void>;
  /** Dismiss the overwrite prompt without saving (the invalid file is left untouched). */
  cancelInvalidOverwrite: () => void;
  /**
   * Run an arbitrary settings write through the shared single-flight queue, so an external writer
   * (the connection secret PUT) serializes in order with `patch`/`refreshFxRate`/
   * `confirmInvalidOverwrite` and cannot clobber a newer committed write. The operation should
   * perform its own network call and reconcile, exactly like the built-in writers. It MUST NOT call
   * another queued writer (`patch`, `refreshFxRate`, `confirmInvalidOverwrite`, or `serializeWrite`):
   * that would await a queue slot which cannot free until the operation returns, deadlocking the queue.
   */
  serializeWrite: SingleFlight;
}

/** The app-wide settings store. */
export const useSettingsStore = create<SettingsState>((set, get) => {
  // One shared single-flight queue serializes EVERY settings write so overlapping commits apply in
  // order and a failed write can never roll back a newer one. The store's own writers
  // (patch, refreshFxRate, confirmInvalidOverwrite) run on it directly; the connection secret PUT, a
  // TanStack mutation living outside the store, joins it via the exposed `serializeWrite`.
  const writeQueue = createSingleFlight();
  return {
    status: 'idle',
    version: null,
    settings: null,
    error: null,
    fieldErrors: {},
    recovered: false,
    paths: null,
    invalidFilePrompt: null,

    hydrate: async () => {
      set({ status: 'loading', error: null, fieldErrors: {} });
      try {
        const body = await apiGet('/api/v1/settings', SettingsResponseSchema);
        set({
          status: 'ready',
          version: body.version,
          settings: body.settings,
          recovered: body.recovered,
          paths: body.paths ?? null,
          // A fresh healthy load supersedes any pending overwrite prompt; leaving it open would
          // contradict the just-loaded state. If the file is still invalid the next save re-arms it.
          invalidFilePrompt: null,
        });
        // A degraded load means the stored file was unreadable and defaults were substituted. Announce it
        // and emit the warning diagnostic here in hydrate, covering both initial startup and reload.
        if (body.recovered) {
          notify({ type: 'settingsLoadDegraded' });
          logDiag({ type: 'settingsLoadDegraded' });
        }
      } catch (err) {
        set({
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to load settings',
        });
      }
    },

    reload: async () => {
      await get().hydrate();
      const { status, recovered } = get();
      // Gate on a healthy load: only `ready` invalidates models, only healthy-and-not-recovered announces
      // (a failed reload is silent; hydrate already recorded the error and `recovered` may be stale).
      if (status !== 'ready') return;
      void queryClient.invalidateQueries({ queryKey: modelsQueryKey });
      if (!recovered) {
        notify({ type: 'settingsReloaded' });
        logDiag({ type: 'settingsReloaded' });
      }
    },

    patch: createPatchAction({ get, set }, writeQueue),

    refreshFxRate: () => writeQueue(() => refreshFxRate(set)),
    confirmInvalidOverwrite: async () => {
      const prompt = get().invalidFilePrompt;
      if (!prompt) return;
      await writeQueue(() =>
        runInvalidOverwrite(
          prompt,
          overwriteCallbacks({ set, saveConfirmDelayMs: SAVE_CONFIRM_DELAY_MS }),
        ),
      );
    },

    cancelInvalidOverwrite: () => set({ invalidFilePrompt: null }),
    serializeWrite: writeQueue,
  };
});
