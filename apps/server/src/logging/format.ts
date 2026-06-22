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

/**
 * Ordinal suffix for a day-of-month (1 -> "st", 2 -> "nd", 11 -> "th", 21 -> "st").
 *
 * @param day - Day of month, 1-31.
 * @returns The two-letter English ordinal suffix.
 */
function ordinalSuffix(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return 'th';
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
 * Human-readable local timestamp:
 * `18th May, 2026 at 12:48:29.951 AM` =
 * `<ordinal day> <Full Month>, <year> at <12-hour>:<mm>:<ss>.<mmm> <AM|PM>`.
 *
 * @param date - The instant to format; rendered in the host's local time zone.
 * @returns The formatted timestamp string.
 */
export function formatTimestamp(date: Date): string {
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();

  const hours24 = date.getHours();
  const period = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');

  return `${day}${ordinalSuffix(day)} ${month}, ${year} at ${hours12}:${mm}:${ss}.${ms} ${period}`;
}

/**
 * Human-readable byte size: "234 bytes", "23.4 kb", "1.23 mb", "4.56 gb".
 *
 * @param bytes - Non-negative integer byte count.
 * @returns A locale-neutral lowercase string with unit suffix.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kb`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} mb`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} gb`;
}

/**
 * Human-readable duration: "47 ms", "1.32 s", "2 m 3 s", "1 h 14 m".
 *
 * @param ms - Non-negative duration in milliseconds.
 * @returns A locale-neutral string with unit suffix(es).
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${m} m ${s} s`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} h ${m} m`;
}
