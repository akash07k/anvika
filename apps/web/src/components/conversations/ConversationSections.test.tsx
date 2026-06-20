import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationSummary } from '@anvika/shared/conversation/responses';

import { ConversationSections } from './ConversationSections';

vi.mock('../../hooks/conversation/useNewConversation', () => ({
  useNewConversation: () => ({ createConversation: vi.fn() }),
}));

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

// A conversation that is pinned, recent, AND lands in the last-7-days bucket.
const PINNED_RECENT: ConversationSummary = {
  id: 'pin-1',
  title: 'Pinned recent',
  updatedAt: NOW - DAY,
  pinnedAt: NOW,
  revision: 1,
};
// An old, unpinned conversation that lands in the Older bucket only.
const OLD: ConversationSummary = {
  id: 'old-1',
  title: 'Ancient chat',
  updatedAt: NOW - 200 * DAY,
  pinnedAt: null,
  revision: 1,
};

/** Render {@link ConversationSections} inside a memory router so the `<Link>`s resolve. */
function renderSections(conversations: ConversationSummary[]) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: () => <ConversationSections conversations={conversations} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/c/${PINNED_RECENT.id}`] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('ConversationSections', () => {
  it('renders each section trigger as a level-3 heading button named by its label', async () => {
    renderSections([PINNED_RECENT, OLD]);
    expect(await screen.findByRole('heading', { level: 3, name: 'Pinned' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Last 7 days' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Older' })).toBeInTheDocument();
  });

  it('starts Pinned and Recent expanded and the time buckets collapsed', async () => {
    renderSections([PINNED_RECENT, OLD]);
    // Expanded sections expose their region in the a11y tree.
    expect(await screen.findByRole('region', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
    // Collapsed time buckets are removed from the a11y tree.
    expect(screen.queryByRole('region', { name: 'Last 7 days' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Older' })).not.toBeInTheDocument();
  });

  it('repeats a pinned-and-recent conversation once per section it belongs to', async () => {
    renderSections([PINNED_RECENT, OLD]);
    const pinned = await screen.findByRole('region', { name: 'Pinned' });
    const recent = screen.getByRole('region', { name: 'Recent' });
    // In Pinned the row reads plainly; in Recent (a non-Pinned section) it gains the "(Pinned)" mark.
    expect(within(pinned).getByRole('link', { name: 'Pinned recent' })).toBeInTheDocument();
    expect(
      within(recent).getByRole('link', { name: 'Pinned recent (Pinned)' }),
    ).toBeInTheDocument();
  });

  it('omits sections with no conversations', async () => {
    // Only a recent conversation: no pinned section, no Older section.
    renderSections([{ ...PINNED_RECENT, pinnedAt: null }]);
    await screen.findByRole('heading', { level: 3, name: 'Recent' });
    expect(screen.queryByRole('heading', { level: 3, name: 'Pinned' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Older' })).not.toBeInTheDocument();
  });

  it('renders nothing for an empty conversation list', () => {
    const { container } = renderSections([]);
    expect(container.querySelector('[data-slot="accordion"]')?.children.length ?? 0).toBe(0);
  });
});
