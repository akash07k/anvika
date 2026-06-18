import axe from 'axe-core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

// A list spanning three sections at once: a pinned conversation (also Recent + its time bucket), a
// plain recent conversation, and an old conversation that lands only in the collapsed Older bucket - so
// the rendered nav exercises the expanded Pinned/Recent shortcuts and a collapsed time bucket together.
const LIST: ConversationListResponse = {
  conversations: [
    { id: 'aaa-111', title: 'A chat', updatedAt: NOW - DAY, pinnedAt: NOW, revision: 1 },
    { id: 'bbb-222', title: '', updatedAt: NOW - 2 * DAY, pinnedAt: null, revision: 0 },
    {
      id: 'ccc-333',
      title: 'Ancient chat',
      updatedAt: NOW - 200 * DAY,
      pinnedAt: null,
      revision: 1,
    },
  ],
  activeId: 'aaa-111',
};
// Mock only `useConversationList`; the row's rename/delete hooks import the cache key and invalidate
// helper from the same module, so the real exports must be preserved.
vi.mock('../../lib/conversation/conversationQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conversation/conversationQueries')>()),
  useConversationList: () => ({ data: LIST }),
}));
vi.mock('../../hooks/conversation/useNewConversation', () => ({
  useNewConversation: () => ({ createConversation: vi.fn() }),
}));

import { ConversationList } from './ConversationList';

/**
 * Run axe-core against an element using the repo's WCAG tag set (matching `MessageReasoning.axe`).
 *
 * `target-size` (SC 2.5.8) is disabled here: it is a pointer-input rule, and Anvika targets only
 * screen-reader and keyboard users (project scope), not low-vision/pointer users. The link's real
 * pointer target comes from a Tailwind `block px-2 py-2` class that this isolated component render
 * does not load CSS for, so the rule would flag a phantom size; the real, CSS-loaded layout is covered
 * by the Playwright E2E axe pass (`expectNoAxeViolations`).
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

/** Render the list inside a memory router so the `<Link>`s resolve, with the active route current. */
function buildRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: () => <ConversationList />,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/c/aaa-111'] }),
  });
}

test('the sectioned Conversations List nav landmark has no axe violations', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={buildRouter()} />
    </QueryClientProvider>,
  );

  // The nav landmark itself is present and named for landmark navigation.
  await expect
    .element(page.getByRole('navigation', { name: 'Conversations List' }))
    .toBeInTheDocument();

  // The Pinned and Recent shortcuts default to expanded, so their region panels are in the a11y tree,
  // accessible-named by their triggers. Each visible section trigger is a level-3 heading.
  await expect.element(page.getByRole('region', { name: 'Pinned' })).toBeInTheDocument();
  await expect.element(page.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
  await expect.element(page.getByRole('heading', { level: 3, name: 'Pinned' })).toBeInTheDocument();
  await expect.element(page.getByRole('heading', { level: 3, name: 'Recent' })).toBeInTheDocument();

  // A collapsed time bucket (the old conversation lands in "Older") keeps its region OUT of the a11y
  // tree by default, so the landmark list is not cluttered by every archive bucket.
  expect(page.getByRole('region', { name: 'Older' }).query()).toBeNull();

  // Zero axe violations against the rendered sectioned nav.
  expect(await axeViolations(container)).toEqual([]);
});
