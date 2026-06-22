import { DEFAULT_KEYMAP, type KeymapAction } from '@anvika/shared/settings/keymap';

import { useSettingsStore } from '../../stores/settingsStore';

/**
 * The resolved keymap: every {@link KeymapAction} mapped to its react-hotkeys-hook binding, with
 * stored overrides merged over the server defaults so the result is always complete. The single
 * read-point the hotkey wiring uses; the rebinding UI is deferred to a later release.
 *
 * @returns A complete record from every action to its current binding string.
 */
export function useKeymap(): Record<KeymapAction, string> {
  const settings = useSettingsStore((s) => s.settings);
  return { ...DEFAULT_KEYMAP, ...settings?.hotkeyBindings };
}
