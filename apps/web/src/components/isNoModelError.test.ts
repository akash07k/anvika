import { expect, it } from 'vitest';

import { isNoModelError } from './isNoModelError';
import { ApiClientError } from '../lib/api-client';

it('detects the typed unconfigured ApiClientError', () => {
  const err = new ApiClientError(
    'unconfigured',
    'No model is selected. Choose a model in Settings.',
    undefined,
  );
  expect(isNoModelError(err)).toBe(true);
});

it('detects an untyped error by message for BOTH server phrasings', () => {
  // The registry emits either "Choose a model in Settings." or "...select a model in Settings.";
  // the fallback matches the shared "a model in Settings" suffix so both route to the Settings link.
  expect(isNoModelError(new Error('No model is selected. Choose a model in Settings.'))).toBe(true);
  expect(
    isNoModelError(
      new Error(
        'The provider for "x" is not configured. Add its key and select a model in Settings.',
      ),
    ),
  ).toBe(true);
});

it('is false for an unrelated error and for no error', () => {
  expect(isNoModelError(new Error('Something went wrong.'))).toBe(false);
  expect(isNoModelError(undefined)).toBe(false);
});
