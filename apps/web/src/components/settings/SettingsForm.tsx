import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { GLOBAL_EFFORT_OPTIONS } from '../../lib/message/reasoning';
import { ConnectionsFieldset } from '../connections/ConnectionsFieldset';
import { CostDisplaySection } from './CostDisplaySection';
import { ModelSection } from './ModelSection';
import { QuickNavSection } from './QuickNavSection';
import { TimestampFormatSection } from './TimestampFormatSection';
import { NumberField } from '../fields/NumberField';
import { SelectField } from '../fields/SelectField';
import { TextField } from '../fields/TextField';
import { ToggleField } from '../fields/ToggleField';

type PatchFn = (
  wirePatch: Record<string, unknown>,
  optimistic: (settings: RedactedSettings) => RedactedSettings,
  options?: { announce?: boolean },
) => Promise<boolean>;

/**
 * Dispatch a single top-level field change as a wire patch plus an optimistic updater. Every
 * user-driven control confirms its save the same way: a successful commit announces "Settings
 * saved" through the notification layer. Hearing a select/toggle's new value confirms the widget
 * changed, not that it persisted, so the confirmation is not redundant. The store's
 * `announce: false` option stays available for any future silent/programmatic commit.
 */
function setField<K extends keyof RedactedSettings>(
  onPatch: PatchFn,
  key: K,
  value: RedactedSettings[K],
): void {
  // Fire-and-forget: a single top-level field change does not sequence a follow-up, so the patch's
  // resolved boolean is intentionally ignored (the store announces success/failure on its own).
  void onPatch({ [key]: value }, (s) => ({ ...s, [key]: value }));
}

/**
 * The accessible settings form, composed by hand from the field primitives. It reads
 * the redacted settings and dispatches each change through `onPatch` (the parent wires that to the
 * store's optimistic write-through). The selected model is set via a populated picker (the available
 * models from `useModels`) plus a custom-id escape hatch; both write `selectedModelId`. The keymap
 * has no editing control yet.
 */
export function SettingsForm({
  settings,
  onPatch,
  fieldErrors = {},
}: {
  settings: RedactedSettings;
  onPatch: PatchFn;
  /**
   * Per-field validation errors keyed by field id, from the last rejected PATCH (ADR 0015). Each
   * field renders its own message as non-live `aria-describedby` text; defaults to no errors.
   */
  fieldErrors?: Record<string, string>;
}) {
  return (
    <form aria-label="Settings" onSubmit={(e) => e.preventDefault()}>
      <ConnectionsFieldset settings={settings} onPatch={onPatch} />

      <ModelSection
        settings={settings}
        fieldErrors={fieldErrors}
        onSelectedModelChange={(v) => setField(onPatch, 'selectedModelId', v)}
      />
      <h2>Preferences</h2>
      <NumberField
        id="announcement-period"
        label="Announcement period (ms)"
        description="How often, in milliseconds, the streaming progress heartbeat ('Generating, N seconds') is announced."
        error={fieldErrors['announcement-period']}
        value={settings.announcementPeriodMs}
        onCommit={(v) => setField(onPatch, 'announcementPeriodMs', v)}
      />
      <ToggleField
        id="read-whole"
        label="Read whole response on completion"
        error={fieldErrors['read-whole']}
        checked={settings.readWholeOnComplete}
        onChange={(v) => setField(onPatch, 'readWholeOnComplete', v)}
      />
      <SelectField
        id="focus-on-completion"
        label="Focus on completion"
        error={fieldErrors['focus-on-completion']}
        value={settings.focusOnCompletion}
        options={[
          { value: 'keep', label: 'Keep focus in composer' },
          { value: 'move', label: 'Move focus to response' },
        ]}
        onChange={(v) =>
          setField(onPatch, 'focusOnCompletion', v as RedactedSettings['focusOnCompletion'])
        }
      />
      <SelectField
        id="send-key"
        label="Send key mode"
        description="Alt+Enter toggles this."
        error={fieldErrors['send-key']}
        value={settings.sendKeyMode}
        options={[
          { value: 'modEnter', label: 'Ctrl/Cmd+Enter sends' },
          { value: 'enter', label: 'Enter sends' },
        ]}
        onChange={(v) => setField(onPatch, 'sendKeyMode', v as RedactedSettings['sendKeyMode'])}
      />
      <SelectField
        id="reasoning-effort"
        label="Thinking effort"
        description="How hard reasoning-capable models think. Off disables thinking."
        error={fieldErrors['reasoning-effort']}
        value={settings.reasoningEffort}
        options={GLOBAL_EFFORT_OPTIONS}
        onChange={(v) =>
          setField(onPatch, 'reasoningEffort', v as RedactedSettings['reasoningEffort'])
        }
      />
      <QuickNavSection
        settings={settings}
        fieldErrors={fieldErrors}
        onSinglePressReadsChange={(v) => setField(onPatch, 'quickNavSinglePressReads', v)}
        onLengthCueChange={(v) => setField(onPatch, 'quickNavLengthCue', v)}
        onPreviewWordsCommit={(v) => setField(onPatch, 'quickNavPreviewWords', v)}
        onDoublePressWindowCommit={(v) => setField(onPatch, 'quickNavDoublePressMs', v)}
      />
      <h3>Display names</h3>
      <TextField
        id="user-name"
        label="Your name"
        description="Shown as the heading on your messages."
        error={fieldErrors['user-name']}
        value={settings.userName}
        onCommit={(v) => setField(onPatch, 'userName', v)}
      />
      <TextField
        id="assistant-name"
        label="Assistant name"
        description="Shown on assistant messages and the assistant Copy button."
        error={fieldErrors['assistant-name']}
        value={settings.assistantName}
        onCommit={(v) => setField(onPatch, 'assistantName', v)}
      />
      <CostDisplaySection
        settings={settings}
        fieldErrors={fieldErrors}
        onCurrencyChange={(v) => setField(onPatch, 'currency', v)}
        onRateCommit={(v) => setField(onPatch, 'inrPerUsd', v)}
        onAutoRefreshChange={(v) => setField(onPatch, 'autoRefreshFxRate', v)}
      />
      <TimestampFormatSection
        settings={settings}
        fieldErrors={fieldErrors}
        onWeekdayChange={(v) => setField(onPatch, 'timestampWeekday', v)}
        onDateStyleChange={(v) => setField(onPatch, 'timestampDateStyle', v)}
        onHourCycleChange={(v) => setField(onPatch, 'timestampHourCycle', v)}
        onSecondsChange={(v) => setField(onPatch, 'timestampSeconds', v)}
      />
    </form>
  );
}
