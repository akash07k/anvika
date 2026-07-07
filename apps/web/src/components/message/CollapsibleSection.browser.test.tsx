import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { CollapsibleSection } from './CollapsibleSection';

/** Render a section with a focusable child so Escape-from-inside can be exercised. */
async function renderSection() {
  return render(
    <CollapsibleSection summaryId="sum-1" regionLabel="Thinking" summary={<h3>Thinking</h3>}>
      <p>body text</p>
      <button type="button">Copy</button>
    </CollapsibleSection>,
  );
}

/** Dispatch a bubbling Escape keydown from an element so it reaches the details key handler. */
function pressEscape(from: Element | null, init: KeyboardEventInit = {}): void {
  from?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init }),
  );
}

test('places the id on the summary and exposes the body as a labelled region', async () => {
  await renderSection();
  expect(document.querySelector('summary')?.id).toBe('sum-1');
  const region = document.querySelector('section[aria-label="Thinking"]');
  expect(region).not.toBeNull();
  expect(region?.textContent).toContain('body text');
});

test('Escape from inside an open section collapses it and returns focus to the summary', async () => {
  await renderSection();
  const details = document.querySelector('details');
  if (!details) throw new Error('expected a details element');
  details.open = true;
  const copy = document.querySelector('button');
  copy?.focus();
  expect(document.activeElement).toBe(copy);
  pressEscape(copy);
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(document.querySelector('summary'));
});

test('Shift+Escape (the stop-generation hotkey) does NOT collapse an open section', async () => {
  await renderSection();
  const details = document.querySelector('details');
  if (!details) throw new Error('expected a details element');
  details.open = true;
  const copy = document.querySelector('button');
  copy?.focus();
  // A modified Escape must pass through so the global Shift+Escape stop hotkey still fires.
  pressEscape(copy, { shiftKey: true });
  expect(details.open).toBe(true);
});

test('Escape does nothing when the section is already collapsed', async () => {
  await renderSection();
  const details = document.querySelector('details');
  if (!details) throw new Error('expected a details element');
  expect(details.open).toBe(false);
  const summary = document.querySelector('summary');
  summary?.focus();
  pressEscape(summary);
  expect(details.open).toBe(false);
});
