import { describe, expect, it } from 'vitest';

import { LOG_LEVELS, LOG_THRESHOLDS, LogThresholdSchema } from './log-entry';

describe('LOG_THRESHOLDS', () => {
  it('is every level plus the off threshold', () => {
    expect(LOG_THRESHOLDS).toEqual([...LOG_LEVELS, 'off']);
  });

  it('accepts off and every level, rejects an unknown value', () => {
    expect(LogThresholdSchema.parse('off')).toBe('off');
    expect(LogThresholdSchema.parse('info')).toBe('info');
    expect(() => LogThresholdSchema.parse('loud')).toThrow();
  });
});
