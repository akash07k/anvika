import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { NumberField } from '../fields/NumberField';
import { SelectField } from '../fields/SelectField';

/** Props for {@link QuickNavSection}. */
export interface QuickNavSectionProps {
  /** The redacted settings the section reads its quick-nav fields from. */
  settings: RedactedSettings;
  /** Per-field validation errors keyed by field id, from the last rejected PATCH. */
  fieldErrors: Record<string, string>;
  /** Commit the single-press read mode. */
  onSinglePressReadsChange: (value: RedactedSettings['quickNavSinglePressReads']) => void;
  /** Commit the length-cue position. */
  onLengthCueChange: (value: RedactedSettings['quickNavLengthCue']) => void;
  /** Commit the descriptor preview length in words. */
  onPreviewWordsCommit: (value: number) => void;
  /** Commit the double-press window in milliseconds. */
  onDoublePressWindowCommit: (value: number) => void;
}

/**
 * The quick-navigation settings group: what a single Alt+number press reads, the length-cue position
 * and descriptor preview length (both only apply when single press reads the descriptor, so they
 * disable otherwise), and the double-press window. Extracted from {@link SettingsForm} so that file
 * stays under the per-file line cap (ADR 0007).
 *
 * @param props - See {@link QuickNavSectionProps}.
 * @returns The quick-navigation settings group.
 */
export function QuickNavSection({
  settings,
  fieldErrors,
  onSinglePressReadsChange,
  onLengthCueChange,
  onPreviewWordsCommit,
  onDoublePressWindowCommit,
}: QuickNavSectionProps) {
  const descriptorActive = settings.quickNavSinglePressReads === 'descriptor';
  return (
    <>
      <SelectField
        id="quicknav-reads"
        label="Quick-nav single press reads"
        description="What a single Alt+number press reads: a short descriptor, or the full message. A double press focuses the message either way."
        error={fieldErrors['quicknav-reads']}
        value={settings.quickNavSinglePressReads}
        options={[
          { value: 'descriptor', label: 'Descriptor' },
          { value: 'full', label: 'Full content' },
        ]}
        onChange={(v) =>
          onSinglePressReadsChange(v as RedactedSettings['quickNavSinglePressReads'])
        }
      />
      <SelectField
        id="quicknav-length-cue"
        label="Quick-nav length cue position"
        description="Only applies when single press reads the descriptor."
        error={fieldErrors['quicknav-length-cue']}
        value={settings.quickNavLengthCue}
        disabled={!descriptorActive}
        options={[
          { value: 'count-first', label: 'Word count first' },
          { value: 'count-after', label: 'Remaining count after preview' },
        ]}
        onChange={(v) => onLengthCueChange(v as RedactedSettings['quickNavLengthCue'])}
      />
      <NumberField
        id="quicknav-preview-words"
        label="Quick-nav preview length (words)"
        description="Only applies when single press reads the descriptor."
        error={fieldErrors['quicknav-preview-words']}
        value={settings.quickNavPreviewWords}
        disabled={!descriptorActive}
        onCommit={onPreviewWordsCommit}
      />
      <NumberField
        id="quicknav-window"
        label="Quick-nav double-press window (ms)"
        description="How long, in milliseconds, after a first Alt+number press a second press still counts as a double press."
        error={fieldErrors['quicknav-window']}
        value={settings.quickNavDoublePressMs}
        onCommit={onDoublePressWindowCommit}
      />
    </>
  );
}
