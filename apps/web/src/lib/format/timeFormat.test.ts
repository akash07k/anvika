import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMESTAMP_OPTIONS, type TimestampFormatOptions } from './timestampOptions';
import {
  formatClockTime,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatTimestamp,
} from './timeFormat';

// Monday, 8 June 2026, 13:53:42 local time. (8 June 2026 is a Monday - getDay() === 1.)
const t = new Date(2026, 5, 8, 13, 53, 42).getTime();
const opts = (over: Partial<TimestampFormatOptions> = {}): TimestampFormatOptions => ({
  ...DEFAULT_TIMESTAMP_OPTIONS,
  ...over,
});

describe('timeFormat defaults reproduce the original output (regression guard)', () => {
  it('formatClockTime: 12-hour with seconds', () => {
    expect(formatClockTime(t, DEFAULT_TIMESTAMP_OPTIONS)).toBe('1:53:42 PM');
  });
  it('formatDate: ordinal day-first', () => {
    expect(formatDate(t, DEFAULT_TIMESTAMP_OPTIONS)).toBe('8th June 2026');
  });
  it('formatDateTime: weekday + ordinal date + time', () => {
    expect(formatDateTime(t, DEFAULT_TIMESTAMP_OPTIONS)).toBe(
      'Monday, 8th June 2026 at 1:53:42 PM',
    );
  });
  it('formatTimestamp: clock when same day, datetime otherwise', () => {
    const sameDay = new Date(2026, 5, 8, 18, 0, 0).getTime();
    expect(formatTimestamp(t, sameDay, DEFAULT_TIMESTAMP_OPTIONS)).toBe('1:53:42 PM');
    const nextDay = new Date(2026, 5, 9, 9, 0, 0).getTime();
    expect(formatTimestamp(t, nextDay, DEFAULT_TIMESTAMP_OPTIONS)).toBe(
      'Monday, 8th June 2026 at 1:53:42 PM',
    );
  });
  it('formatRelativeTime: buckets recency then the absolute fallback', () => {
    expect(formatRelativeTime(t, t + 5_000, DEFAULT_TIMESTAMP_OPTIONS)).toBe('just now');
    expect(formatRelativeTime(t, t + 90_000, DEFAULT_TIMESTAMP_OPTIONS)).toBe('1 minute ago');
    expect(formatRelativeTime(t, t + 2 * 60_000, DEFAULT_TIMESTAMP_OPTIONS)).toBe('2 minutes ago');
    expect(formatRelativeTime(t, t + 3 * 3_600_000, DEFAULT_TIMESTAMP_OPTIONS)).toBe('3 hours ago');
    expect(
      formatRelativeTime(t, new Date(2026, 5, 9, 14, 0, 0).getTime(), DEFAULT_TIMESTAMP_OPTIONS),
    ).toBe('yesterday');
    expect(
      formatRelativeTime(t, new Date(2026, 5, 11, 9, 0, 0).getTime(), DEFAULT_TIMESTAMP_OPTIONS),
    ).toBe('Monday, 8th June 2026 at 1:53:42 PM');
  });
});

describe('timeFormat honors the options matrix', () => {
  it('formatClockTime: 12h no seconds', () => {
    expect(formatClockTime(t, opts({ seconds: false }))).toBe('1:53 PM');
  });
  it('formatClockTime: 24h with seconds', () => {
    expect(formatClockTime(t, opts({ hourCycle: 'h24' }))).toBe('13:53:42');
  });
  it('formatClockTime: 24h no seconds', () => {
    expect(formatClockTime(t, opts({ hourCycle: 'h24', seconds: false }))).toBe('13:53');
  });
  it('formatClockTime: midnight reads 12 in 12h and 00 in 24h', () => {
    const midnight = new Date(2026, 5, 8, 0, 5, 0).getTime();
    expect(formatClockTime(midnight, opts({ seconds: false }))).toBe('12:05 AM');
    expect(formatClockTime(midnight, opts({ hourCycle: 'h24', seconds: false }))).toBe('00:05');
  });
  it('formatDate: US month-first has no ordinal', () => {
    expect(formatDate(t, opts({ dateStyle: 'month-first' }))).toBe('June 8, 2026');
  });
  it('formatDateTime: weekday off drops the weekday prefix', () => {
    expect(formatDateTime(t, opts({ weekday: false }))).toBe('8th June 2026 at 1:53:42 PM');
  });
  it('formatDateTime: month-first + weekday off + 24h + no seconds', () => {
    expect(
      formatDateTime(
        t,
        opts({ weekday: false, dateStyle: 'month-first', hourCycle: 'h24', seconds: false }),
      ),
    ).toBe('June 8, 2026 at 13:53');
  });
});
