import type { TimestampFormatOptions } from './timestampOptions';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * English ordinal suffix for a day of month (1-31): `st`, `nd`, `rd`, or `th`.
 *
 * @param day - Day of month in the range 1-31.
 * @returns The two-letter ordinal suffix.
 */
function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return 'th';
  }
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/**
 * Determine whether two instants fall on the same local calendar day.
 *
 * @param a - First instant, milliseconds since the Unix epoch.
 * @param b - Second instant, milliseconds since the Unix epoch.
 * @returns True when both instants share the same local year, month, and day.
 */
function sameDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/**
 * Format a clock time per `options`: 12-hour ("1:53:42 PM" / "1:53 PM") or 24-hour ("13:53:42" /
 * "13:53"), with or without seconds. Local time, screen-reader-clean.
 *
 * @param instant - Milliseconds since the Unix epoch.
 * @param options - The timestamp format options (hour cycle and seconds apply here).
 * @returns The clock string.
 */
export function formatClockTime(instant: number, options: TimestampFormatOptions): string {
  const d = new Date(instant);
  const hours = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  if (options.hourCycle === 'h24') {
    const hh = String(hours).padStart(2, '0');
    return options.seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  }
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const marker = hours < 12 ? 'AM' : 'PM';
  return options.seconds ? `${h12}:${mm}:${ss} ${marker}` : `${h12}:${mm} ${marker}`;
}

/**
 * Format a date per `options.dateStyle`: ordinal day-first ("8th June 2026") or US month-first
 * ("June 8, 2026", no ordinal suffix). Local time, screen-reader-clean.
 *
 * @param instant - Milliseconds since the Unix epoch.
 * @param options - The timestamp format options (date style applies here).
 * @returns The date string.
 */
export function formatDate(instant: number, options: TimestampFormatOptions): string {
  const d = new Date(instant);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  if (options.dateStyle === 'month-first') {
    return `${month} ${day}, ${year}`;
  }
  return `${day}${ordinal(day)} ${month} ${year}`;
}

/**
 * Format a full date-and-time per `options`: an optional weekday prefix, the date (per date style),
 * " at ", and the clock time. With defaults: "Monday, 8th June 2026 at 1:53:42 PM".
 *
 * @param instant - Milliseconds since the Unix epoch.
 * @param options - The timestamp format options (all four apply here).
 * @returns The date-and-time string.
 */
export function formatDateTime(instant: number, options: TimestampFormatOptions): string {
  const prefix = options.weekday ? `${WEEKDAYS[new Date(instant).getDay()]}, ` : '';
  return `${prefix}${formatDate(instant, options)} at ${formatClockTime(instant, options)}`;
}

/**
 * Format an inline transcript timestamp: the clock time when `instant` is on the same local day as
 * `now`, otherwise the full date-and-time per `options` (the weekday prefix, date style, and clock
 * format are each configurable). Absolute and stable when scrolling back.
 *
 * @param instant - The instant being labelled, milliseconds since the Unix epoch.
 * @param now - The reference instant (typically the current time), milliseconds since the epoch.
 * @param options - The timestamp format options; the clock fields apply on the same-day branch, all
 *   four on the not-today fallback.
 * @returns The screen-reader-clean timestamp string.
 */
export function formatTimestamp(
  instant: number,
  now: number,
  options: TimestampFormatOptions,
): string {
  return sameDay(instant, now)
    ? formatClockTime(instant, options)
    : formatDateTime(instant, options);
}

/**
 * Format spoken recency for the quick-nav descriptor: bucketed (`just now`, `N seconds ago`,
 * `N minute(s) ago`, `N hour(s) ago`, `yesterday`), falling back to the absolute date-and-time per
 * `options` once older than yesterday. Minute and hour buckets floor, so 90 seconds reads as
 * `1 minute ago`, not `2 minutes ago`.
 *
 * @param instant - The instant being described, milliseconds since the Unix epoch.
 * @param now - The reference instant (typically the current time), milliseconds since the epoch.
 * @param options - The timestamp format options (used for the absolute fallback only).
 * @returns The screen-reader-clean recency string.
 */
export function formatRelativeTime(
  instant: number,
  now: number,
  options: TimestampFormatOptions,
): string {
  // Clamp to >= 0 so a clock-skew "future" instant reads "just now", never a negative duration.
  const secs = Math.max(0, Math.round((now - instant) / 1000));
  if (secs < 10) {
    return 'just now';
  }
  if (secs < 60) {
    return `${secs} seconds ago`;
  }
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24 && sameDay(instant, now)) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(instant, yesterday.getTime())) {
    return 'yesterday';
  }
  return formatDateTime(instant, options);
}
