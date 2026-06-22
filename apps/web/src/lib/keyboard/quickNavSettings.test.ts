import type { RedactedSettings } from '@anvika/shared/settings/redact';
import { describe, expect, it } from 'vitest';

import { getQuickNavSettings } from './quickNavSettings';

describe('getQuickNavSettings', () => {
  it('applies all four defaults when settings are not yet loaded', () => {
    expect(getQuickNavSettings(null)).toEqual({
      quickNavReads: 'descriptor',
      quickNavDoublePressMs: 500,
      quickNavLengthCue: 'count-first',
      quickNavPreviewWords: 40,
    });
    expect(getQuickNavSettings(undefined)).toEqual(getQuickNavSettings(null));
  });

  it('passes through configured values over the defaults', () => {
    const settings = {
      quickNavSinglePressReads: 'full',
      quickNavDoublePressMs: 250,
      quickNavLengthCue: 'count-after',
      quickNavPreviewWords: 12,
    } as RedactedSettings;
    expect(getQuickNavSettings(settings)).toEqual({
      quickNavReads: 'full',
      quickNavDoublePressMs: 250,
      quickNavLengthCue: 'count-after',
      quickNavPreviewWords: 12,
    });
  });
});
