import { describe, expect, it } from 'vitest';

import { deriveTimestampOptions } from './timestampOptions';

describe('deriveTimestampOptions', () => {
  it('projects the four timestamp settings into the options shape', () => {
    const options = deriveTimestampOptions({
      timestampWeekday: false,
      timestampDateStyle: 'month-first',
      timestampHourCycle: 'h24',
      timestampSeconds: false,
    });
    expect(options).toEqual({
      weekday: false,
      dateStyle: 'month-first',
      hourCycle: 'h24',
      seconds: false,
    });
  });

  it('falls back to today-reproducing defaults when settings are undefined', () => {
    expect(deriveTimestampOptions(undefined)).toEqual({
      weekday: true,
      dateStyle: 'day-first',
      hourCycle: 'h12',
      seconds: true,
    });
  });
});
