import axe from 'axe-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

vi.mock('../../lib/conversation/conversationMutations', () => ({
  batchDeleteConversations: vi.fn(),
}));

import { ManageConversationsDialog } from './ManageConversationsDialog';

const LIST: ConversationListResponse = {
  conversations: [
    { id: 'aaa-111', title: 'A chat', updatedAt: 2, pinnedAt: null, revision: 1 },
    { id: 'bbb-222', title: '', updatedAt: 1, pinnedAt: null, revision: 0 },
  ],
  activeId: 'aaa-111',
};

/**
 * Run axe-core against an element using the repo's WCAG tag set.
 *
 * `target-size` (SC 2.5.8) is disabled: it is a pointer-input rule, and Anvika targets only
 * screen-reader and keyboard users (project scope); the real, CSS-loaded layout (which gives the
 * dialog's icon Close button its pointer target) is covered by the Playwright E2E axe pass.
 *
 * @param element - The DOM subtree to audit.
 * @returns The axe rule violations found (empty when accessible).
 */
async function axeViolations(element: Element): Promise<axe.Result[]> {
  const results = await axe.run(element, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    rules: { 'target-size': { enabled: false } },
  });
  return results.violations;
}

test('the open Manage conversations dialog has no axe violations', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, LIST);
  await render(
    <QueryClientProvider client={queryClient}>
      <ManageConversationsDialog />
    </QueryClientProvider>,
  );

  await userEvent.click(page.getByRole('button', { name: 'Manage conversations, 2 total' }));
  await expect
    .element(page.getByRole('dialog', { name: 'Manage conversations' }))
    .toBeInTheDocument();

  // The dialog portals to <body>, so audit the whole document body.
  expect(await axeViolations(document.body)).toEqual([]);
});
