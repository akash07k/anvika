import { describe, expect, it } from 'vitest';

import { formatBytes, formatDuration, formatTimestamp } from './format';

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(234)).toBe('234 bytes');
  });
  it('formats kilobytes', () => {
    expect(formatBytes(23_961)).toBe('23.4 kb');
  });
  it('formats megabytes', () => {
    expect(formatBytes(1_289_748)).toBe('1.23 mb');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds under a second', () => {
    expect(formatDuration(47)).toBe('47 ms');
  });
  it('formats seconds', () => {
    expect(formatDuration(1320)).toBe('1.32 s');
  });
  it('formats minutes and seconds', () => {
    expect(formatDuration(123_000)).toBe('2 m 3 s');
  });
});

describe('formatTimestamp', () => {
  it('formats the canonical spec example (midnight, 1st-style ordinal handled elsewhere)', () => {
    expect(formatTimestamp(new Date(2026, 4, 18, 0, 48, 29, 951))).toBe(
      '18th May, 2026 at 12:48:29.951 AM',
    );
  });

  it('renders ordinal suffixes for 1st, 2nd, 3rd', () => {
    expect(formatTimestamp(new Date(2026, 0, 1, 9, 5, 7, 1))).toBe(
      '1st January, 2026 at 9:05:07.001 AM',
    );
    expect(formatTimestamp(new Date(2026, 0, 2, 9, 0, 0, 0))).toBe(
      '2nd January, 2026 at 9:00:00.000 AM',
    );
    expect(formatTimestamp(new Date(2026, 0, 3, 9, 0, 0, 0))).toBe(
      '3rd January, 2026 at 9:00:00.000 AM',
    );
  });

  it('renders -th for the 11th, 12th, 13th teens', () => {
    expect(formatTimestamp(new Date(2026, 0, 11, 9, 0, 0, 0))).toMatch(/^11th /);
    expect(formatTimestamp(new Date(2026, 0, 12, 9, 0, 0, 0))).toMatch(/^12th /);
    expect(formatTimestamp(new Date(2026, 0, 13, 9, 0, 0, 0))).toMatch(/^13th /);
  });

  it('renders ordinal suffixes for 21st, 22nd, 23rd, 31st', () => {
    expect(formatTimestamp(new Date(2026, 0, 21, 9, 0, 0, 0))).toMatch(/^21st /);
    expect(formatTimestamp(new Date(2026, 0, 22, 9, 0, 0, 0))).toMatch(/^22nd /);
    expect(formatTimestamp(new Date(2026, 0, 23, 9, 0, 0, 0))).toMatch(/^23rd /);
    expect(formatTimestamp(new Date(2026, 0, 31, 9, 0, 0, 0))).toMatch(/^31st /);
  });

  it('renders a PM time', () => {
    expect(formatTimestamp(new Date(2026, 4, 18, 13, 4, 5, 60))).toBe(
      '18th May, 2026 at 1:04:05.060 PM',
    );
  });

  it('renders midday as 12 PM and midnight as 12 AM', () => {
    expect(formatTimestamp(new Date(2026, 4, 18, 12, 0, 0, 0))).toBe(
      '18th May, 2026 at 12:00:00.000 PM',
    );
    expect(formatTimestamp(new Date(2026, 4, 18, 0, 0, 0, 0))).toBe(
      '18th May, 2026 at 12:00:00.000 AM',
    );
  });
});
