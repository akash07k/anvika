import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

// Smoke test for the vendored shadcn Accordion (Radix). Real Chromium exercises the heading-wrapped
// trigger, the region panel, and the keyboard expand that jsdom cannot model (ADR 0013). It also
// pins the accessibility contract the sectioned nav relies on: each trigger is a button inside an
// <h3>, an expanded item's content is a reachable region, and a collapsed item's content is removed
// from the accessibility tree. Accessible queries only.

function Harness() {
  return (
    <Accordion type="multiple" defaultValue={['a']}>
      <AccordionItem value="a">
        <AccordionTrigger>Section A</AccordionTrigger>
        <AccordionContent>Alpha contents.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger>Section B</AccordionTrigger>
        <AccordionContent>Bravo contents.</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

test('each trigger is a button inside an h3 heading', async () => {
  await render(<Harness />);

  const headingA = page.getByRole('heading', { level: 3, name: 'Section A' });
  const headingB = page.getByRole('heading', { level: 3, name: 'Section B' });
  await expect.element(headingA).toBeInTheDocument();
  await expect.element(headingB).toBeInTheDocument();

  await expect.element(page.getByRole('button', { name: 'Section A' })).toBeInTheDocument();
  await expect.element(page.getByRole('button', { name: 'Section B' })).toBeInTheDocument();
});

test('the default-open item exposes its content region and the collapsed item does not', async () => {
  await render(<Harness />);

  await expect.element(page.getByText('Alpha contents.')).toBeVisible();
  expect(page.getByText('Bravo contents.').query()).toBeNull();
});

test('pressing Enter on a collapsed trigger expands its content region', async () => {
  await render(<Harness />);

  const triggerB = page.getByRole('button', { name: 'Section B' });
  (triggerB.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');

  await expect.element(page.getByText('Bravo contents.')).toBeVisible();
});
