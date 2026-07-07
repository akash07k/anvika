import axe from 'axe-core';
import { render } from 'vitest-browser-react';
import { expect, test } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { MessageReasoning } from './MessageReasoning';

/**
 * Run axe-core against an element using the repo's WCAG tag set (2.0 A, 2.0 AA, 2.2 AA) - the same
 * tags the Playwright E2E axe checks use (see `tests/e2e/connections-helpers.ts`). Real Chromium is
 * required because `MessageReasoning` renders Streamdown (Shiki), which only mounts in browser mode.
 *
 * @param element - The DOM subtree to audit.
 * @returns The axe rule violations found (empty when accessible).
 */
async function axeViolations(element: Element): Promise<axe.Result[]> {
  const results = await axe.run(element, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
  });
  return results.violations;
}

const message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'reasoning', text: 'I weigh the options carefully.' }],
  metadata: { createdAt: 1, reasoningMs: 8200, usage: { tokens: { reasoning: 320 } } },
} as AnvikaUIMessage;

test('Thinking region renders collapsed by default and has no axe violations', async () => {
  const { container } = await render(
    <MessageReasoning message={message} busy={false} domId="a1" />,
  );
  // Collapsed by default: the native <details> carries no `open` attribute until the user discloses.
  const details = container.querySelector('details');
  expect(details).not.toBeNull();
  expect(details?.hasAttribute('open')).toBe(false);
  // The h3-inside-summary disclosure pattern is a deliberate, reviewed accessibility choice; axe must
  // find zero violations across the repo's WCAG tag set.
  expect(await axeViolations(container)).toEqual([]);
});

test('expanded Thinking exposes a labelled region landmark with no axe violations', async () => {
  const { container } = await render(
    <MessageReasoning message={message} busy={false} domId="a1" />,
  );
  // Expand the disclosure so its body (the labelled region landmark) is exposed to assistive tech.
  const details = container.querySelector('details');
  if (details) details.open = true;
  expect(container.querySelector('section[aria-label="Thinking"]')).not.toBeNull();
  expect(await axeViolations(container)).toEqual([]);
});
