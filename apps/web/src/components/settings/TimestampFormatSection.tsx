import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { SelectField } from '../fields/SelectField';
import { ToggleField } from '../fields/ToggleField';

/** Props for {@link TimestampFormatSection}. */
export interface TimestampFormatSectionProps {
  /** The redacted settings the section reads its four timestamp fields from. */
  settings: RedactedSettings;
  /** Per-field validation errors keyed by field id, from the last rejected PATCH. */
  fieldErrors: Record<string, string>;
  /** Commit the weekday-prefix toggle. */
  onWeekdayChange: (on: boolean) => void;
  /** Commit the date style. */
  onDateStyleChange: (value: RedactedSettings['timestampDateStyle']) => void;
  /** Commit the hour cycle. */
  onHourCycleChange: (value: RedactedSettings['timestampHourCycle']) => void;
  /** Commit the seconds toggle. */
  onSecondsChange: (on: boolean) => void;
}

/**
 * The "Timestamp format" settings subsection: the weekday toggle, date-style and clock
 * selects, and the seconds toggle. Extracted from {@link SettingsForm} so that form stays under the
 * per-file line cap (ADR 0007); the defaults reproduce the earlier output, so an un-customized
 * install is unchanged.
 *
 * @param props - See {@link TimestampFormatSectionProps}.
 * @returns The Timestamp format section.
 */
export function TimestampFormatSection({
  settings,
  fieldErrors,
  onWeekdayChange,
  onDateStyleChange,
  onHourCycleChange,
  onSecondsChange,
}: TimestampFormatSectionProps) {
  return (
    <>
      <h3>Timestamp format</h3>
      <ToggleField
        id="timestamp-weekday"
        label="Show weekday"
        description="Prefix a not-today message time with its weekday."
        error={fieldErrors['timestamp-weekday']}
        checked={settings.timestampWeekday}
        onChange={onWeekdayChange}
      />
      <SelectField
        id="timestamp-date-style"
        label="Date style"
        error={fieldErrors['timestamp-date-style']}
        value={settings.timestampDateStyle}
        options={[
          { value: 'day-first', label: 'Day first (8th June 2026)' },
          { value: 'month-first', label: 'Month first (June 8, 2026)' },
        ]}
        onChange={(v) => onDateStyleChange(v as RedactedSettings['timestampDateStyle'])}
      />
      <SelectField
        id="timestamp-clock"
        label="Clock"
        error={fieldErrors['timestamp-clock']}
        value={settings.timestampHourCycle}
        options={[
          { value: 'h12', label: '12-hour' },
          { value: 'h24', label: '24-hour' },
        ]}
        onChange={(v) => onHourCycleChange(v as RedactedSettings['timestampHourCycle'])}
      />
      <ToggleField
        id="timestamp-seconds"
        label="Show seconds"
        description="Include seconds in a message time, or omit them."
        error={fieldErrors['timestamp-seconds']}
        checked={settings.timestampSeconds}
        onChange={onSecondsChange}
      />
    </>
  );
}
