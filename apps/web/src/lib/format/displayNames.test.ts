import { describe, expect, it } from 'vitest';

import { resolveDisplayLabels } from './displayNames';

describe('resolveDisplayLabels', () => {
  it('falls back to You/Assistant when unset', () => {
    expect(resolveDisplayLabels(undefined, undefined)).toEqual({
      user: 'You',
      assistant: 'Assistant',
    });
  });

  it('falls back when blank or whitespace-only', () => {
    expect(resolveDisplayLabels('', '   ')).toEqual({ user: 'You', assistant: 'Assistant' });
  });

  it('keeps and trims explicit names', () => {
    expect(resolveDisplayLabels('  Akash ', 'Erica')).toEqual({
      user: 'Akash',
      assistant: 'Erica',
    });
  });
});
