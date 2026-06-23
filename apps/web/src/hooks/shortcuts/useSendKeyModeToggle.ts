import { logDiag } from '../../diagnostics/logDiag';
import { isMac } from '../../lib/keyboard/keyboardHelpers';
import { notify } from '../../notifications/notifier';
import { useSettingsStore } from '../../stores/settingsStore';

/**
 * Returns a handler that toggles the send key mode (`modEnter` <-> `enter`) on the fly. It flips the
 * persisted `sendKeyMode` through the store's optimistic write-through with `announce:false` (so the
 * generic "Settings saved" does not double-speak), announces the new mode through the notification
 * layer (stamping the platform so the speech channel stays a pure mapping), and emits a content-safe
 * `sendKeyModeToggled` keyboard diagnostic (the first-class log for this action). Before settings
 * hydrate it logs `applied:false`, speaks "Settings are still loading", and does nothing else - so
 * the key is never silently inert and never announces or logs a change that did not persist.
 *
 * @returns A handler taking the bound keystroke (recorded in the diagnostic), bound to the hotkey.
 */
export function useSendKeyModeToggle(): (key: string) => void {
  const settings = useSettingsStore((s) => s.settings);
  const patch = useSettingsStore((s) => s.patch);
  return (key: string) => {
    if (!settings) {
      logDiag({ type: 'sendKeyModeToggled', key, applied: false });
      notify({ type: 'settingsNotReady' });
      return;
    }
    const next = settings.sendKeyMode === 'enter' ? 'modEnter' : 'enter';
    void patch({ sendKeyMode: next }, (s) => ({ ...s, sendKeyMode: next }), { announce: false });
    logDiag({ type: 'sendKeyModeToggled', key, applied: true, mode: next });
    notify({ type: 'sendKeyModeChanged', mode: next, isMac: isMac() });
  };
}
