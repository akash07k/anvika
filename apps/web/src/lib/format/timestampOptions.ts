import type { RedactedSettings } from '@anvika/shared/settings/redact';

/** The four knobs that shape an absolute message timestamp; the pure `timeFormat` helpers take this. */
export interface TimestampFormatOptions {
  /** Show the weekday prefix on a not-today timestamp. */
  weekday: boolean;
  /** Ordinal day-first ("8th June 2026") or US month-first ("June 8, 2026"). */
  dateStyle: 'day-first' | 'month-first';
  /** 12-hour ("1:53 PM") or 24-hour ("13:53") clock. */
  hourCycle: 'h12' | 'h24';
  /** Include the seconds component. */
  seconds: boolean;
}

/** The options that reproduce the original output: weekday on, day-first, 12-hour, seconds on. */
export const DEFAULT_TIMESTAMP_OPTIONS: TimestampFormatOptions = {
  weekday: true,
  dateStyle: 'day-first',
  hourCycle: 'h12',
  seconds: true,
};

/** The subset of settings `deriveTimestampOptions` reads (kept narrow so callers can pass a partial). */
type TimestampSettings = Pick<
  RedactedSettings,
  'timestampWeekday' | 'timestampDateStyle' | 'timestampHourCycle' | 'timestampSeconds'
>;

/**
 * Project the four timestamp settings into {@link TimestampFormatOptions}, falling back to the
 * defaults that reproduce the original output when settings have not hydrated yet. The pure formatters
 * never read settings directly; this is the single boundary between the store and them.
 *
 * @param settings - The (possibly undefined) redacted settings.
 * @returns The derived formatter options.
 */
export function deriveTimestampOptions(
  settings: TimestampSettings | undefined,
): TimestampFormatOptions {
  if (!settings) return DEFAULT_TIMESTAMP_OPTIONS;
  return {
    weekday: settings.timestampWeekday,
    dateStyle: settings.timestampDateStyle,
    hourCycle: settings.timestampHourCycle,
    seconds: settings.timestampSeconds,
  };
}
