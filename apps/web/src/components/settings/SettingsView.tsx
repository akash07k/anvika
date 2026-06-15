import { useEffect, useState } from 'react';

import { logDiag } from '../../diagnostics/logDiag';
import { useDocumentTitle } from '../../hooks/settings/useDocumentTitle';
import { useSettingsStore } from '../../stores/settingsStore';

import { ConfirmDialog } from '../ConfirmDialog';
import { ManageConversationsDialog } from '../conversations/ManageConversationsDialog';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { SettingsForm } from './SettingsForm';

/**
 * The "Reload settings" control and the read-only on-disk file locations. Reload re-reads the
 * settings/secrets files from disk (provider config may have changed underfoot); the paths let an
 * operator find and inspect those files. The paths render as an unordered list of "label: path"
 * static text - never as inputs, since they are informational only, and never a `<dl>` (definition
 * lists navigate poorly with a screen reader) - and the whole list is omitted until the paths are
 * known (before hydration `paths` is null).
 *
 * @param props.onReload - Re-read settings from disk (the store `reload` action).
 * @param props.paths - The resolved settings/secrets file locations, or null before hydration.
 */
function SettingsDataSection({
  onReload,
  paths,
}: {
  onReload: () => void;
  paths: { settings: string; secrets: string } | null;
}) {
  return (
    <section aria-label="Settings files">
      <button type="button" onClick={onReload}>
        Reload settings
      </button>
      {paths ? (
        <ul className="list-disc pl-6">
          <li>Settings file: {paths.settings}</li>
          <li>Secrets file: {paths.secrets}</li>
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The settings surface. It hydrates the Zustand store once on mount, shows an
 * accessible loading status until the redacted settings resolve, then renders the form. A
 * successful save is confirmed audibly through the centralized notification layer (the store emits
 * `settingsSaved`); a save failure is announced once through the same layer (`settingsSaveFailed`)
 * with each rejected field shown inline as non-live text (ADR 0015). A LOAD error still renders an
 * assertive `role="alert"` (the load path has no per-field detail and the notifier is not yet wired
 * for it); the global save-failure summary here is non-live and shown only when no field maps.
 *
 * Lives in `components/` (not the route file) so the route module exports only its `Route`, which
 * keeps the route code-splittable (a non-`Route` export from a route file defeats code-splitting).
 */
export function SettingsView() {
  useDocumentTitle('Settings - Anvika');
  const {
    status,
    settings,
    error,
    fieldErrors,
    paths,
    invalidFilePrompt,
    hydrate,
    patch,
    reload,
    confirmInvalidOverwrite,
    cancelInvalidOverwrite,
  } = useSettingsStore();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (status === 'idle') void hydrate();
  }, [status, hydrate]);

  if (status === 'loading' || status === 'idle') {
    return (
      <section aria-label="Settings">
        <h1>Settings</h1>
        <output>Loading settings...</output>
      </section>
    );
  }

  if (status === 'error' || !settings) {
    return (
      <section aria-label="Settings">
        <h1>Settings</h1>
        <p role="alert">Could not load settings{error ? `: ${error}` : ''}.</p>
      </section>
    );
  }

  // Per-field validation messages render inline on each control and the notifier speaks the failure
  // once (ADR 0015), so the global summary is the fallback for failures that map to no field. It is
  // NON-live (not `role="alert"`) to avoid double-speaking against the notifier's announcement, and it
  // is suppressed entirely whenever any field error is shown (per-field suppresses global).
  const showGlobalError = error !== null && Object.keys(fieldErrors).length === 0;

  return (
    <section aria-label="Settings">
      <h1>Settings</h1>
      {showGlobalError ? <p>{error}</p> : null}
      <SettingsForm settings={settings} onPatch={patch} fieldErrors={fieldErrors} />
      <ManageConversationsDialog />
      <SettingsDataSection onReload={reload} paths={paths} />
      <button
        type="button"
        onClick={() => {
          logDiag({ type: 'keyboardShortcutsOpened' });
          setShortcutsOpen(true);
        }}
      >
        View keyboard shortcuts
      </button>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConfirmDialog
        open={invalidFilePrompt !== null}
        title="Overwrite the settings file?"
        description={`The settings file${
          paths ? ` at ${paths.settings}` : ''
        } is invalid. Overwriting it discards any manual edits and replaces it with the current settings.`}
        confirmLabel="Overwrite and save"
        destructive
        onConfirm={confirmInvalidOverwrite}
        onCancel={cancelInvalidOverwrite}
      />
    </section>
  );
}
