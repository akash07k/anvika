import type { RedactedSettings } from '@anvika/shared/settings/redact';

/** Quick-nav settings read from the store for {@link useChatHotkeys}. */
export interface QuickNavSettings {
  /** Single-press read mode: show descriptor or full text. */
  quickNavReads: 'descriptor' | 'full';
  /** Double-press window in milliseconds. */
  quickNavDoublePressMs: number;
  /** Length cue style: count-first or count-after. */
  quickNavLengthCue: 'count-first' | 'count-after';
  /** Number of preview words to read for length cues. */
  quickNavPreviewWords: number;
}

/**
 * Derive the quick-nav settings slice needed by `useChatHotkeys`, applying defaults when `settings`
 * is not yet loaded. A pure function (no React hooks), extracted to keep `ConversationView` under the
 * 200-line ADR-0007 cap.
 *
 * @param settings - The loaded settings object, or `null`/`undefined` before hydration.
 * @returns The four quick-nav fields with their defaults applied.
 */
export function getQuickNavSettings(
  settings: RedactedSettings | null | undefined,
): QuickNavSettings {
  return {
    quickNavReads: settings?.quickNavSinglePressReads ?? 'descriptor',
    quickNavDoublePressMs: settings?.quickNavDoublePressMs ?? 500,
    quickNavLengthCue: settings?.quickNavLengthCue ?? 'count-first',
    quickNavPreviewWords: settings?.quickNavPreviewWords ?? 40,
  };
}
