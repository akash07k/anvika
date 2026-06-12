import { expect, it } from 'vitest';

import { fieldErrorsFromIssues, summarizeSaveFailure } from './settingsFieldErrors';

it('maps top-level scalar issue paths to field ids', () => {
  const map = fieldErrorsFromIssues([
    { path: ['announcementPeriodMs'], message: 'Too small' },
    { path: ['selectedModelId'], message: 'Bad id' },
    { path: ['quickNavLengthCue'], message: 'Bad enum' },
    { path: ['quickNavPreviewWords'], message: 'Too small' },
  ]);
  expect(map).toEqual({
    'announcement-period': 'Too small',
    'selected-model': 'Bad id',
    'quicknav-length-cue': 'Bad enum',
    'quicknav-preview-words': 'Too small',
  });
});

it('does not map a connections path - it falls back to the global summary', () => {
  // Connection inputs live inside the inline ConnectionForm, which validates pre-submit, so a server
  // connection issue is left for the global summary rather than a per-field message.
  expect(
    fieldErrorsFromIssues([{ path: ['connections', 0, 'apiKey'], message: 'Required' }]),
  ).toEqual({});
});

it('ignores unmappable, malformed, or non-string-message input without throwing', () => {
  expect(fieldErrorsFromIssues([{ path: [], message: 'x' }])).toEqual({});
  expect(fieldErrorsFromIssues('nope' as never)).toEqual({});
  // A non-string message is dropped, so the summary never speaks "[object Object]".
  expect(
    fieldErrorsFromIssues([{ path: ['selectedModelId'], message: { evil: 1 } as never }]),
  ).toEqual({});
});

it('summarizes one mapped field as "label: message", else a fallback', () => {
  expect(summarizeSaveFailure({ 'announcement-period': 'Too small' }, 'Could not save')).toBe(
    'Announcement period: Too small',
  );
  // The spoken label keeps the unit so "preview length" is never ambiguous (length in what?).
  expect(summarizeSaveFailure({ 'quicknav-preview-words': 'Too small' }, 'x')).toBe(
    'Quick-nav preview length (words): Too small',
  );
  expect(summarizeSaveFailure({ a: 'x', b: 'y' }, 'Could not save')).toBe(
    '2 fields need attention',
  );
  expect(summarizeSaveFailure({}, 'Could not save settings')).toBe('Could not save settings');
});

it('speaks the "Send key mode" label for a send-key field error', () => {
  expect(summarizeSaveFailure({ 'send-key': 'Invalid' }, 'fallback')).toBe(
    'Send key mode: Invalid',
  );
});

it('falls back to the raw id when a field id has no label entry', () => {
  // An unmapped id is spoken verbatim rather than throwing; the global summary remains the backstop.
  expect(summarizeSaveFailure({ 'mystery-field': 'Bad' }, 'x')).toBe('mystery-field: Bad');
});

it('maps userName and assistantName issues to their field ids', () => {
  const map = fieldErrorsFromIssues([
    { path: ['assistantName'], message: 'Too long' },
    { path: ['userName'], message: 'Too long' },
  ]);
  expect(map).toEqual({ 'assistant-name': 'Too long', 'user-name': 'Too long' });
});

it('maps an inrPerUsd issue to the inr-per-usd field id', () => {
  const out = fieldErrorsFromIssues([{ path: ['inrPerUsd'], message: 'Too big' }]);
  expect(out['inr-per-usd']).toBe('Too big');
});
