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
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { ConversationList } from './ConversationList';

// Mock only the list query so the rendered rows are controllable; the rest of the module (the cache key
// and invalidate helper the row's rename/delete hooks import) keeps its real exports. The New
// conversation button's hook is not exercised here (its create flow has its own browser test), but its
// render must not crash.
const useConversationList = vi.fn<() => { data: ConversationListResponse | undefined }>();
vi.mock('../../lib/conversation/conversationQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conversation/conversationQueries')>()),
  useConversationList: () => useConversationList(),
}));
// The button's create action needs the navigate hook; a no-op keeps the render pure for jsdom.
vi.mock('../../hooks/conversation/useNewConversation', () => ({
  useNewConversation: () => ({ createConversation: vi.fn() }),
}));

const ID_A = 'aaa-111';
const ID_B = 'bbb-222';

/** Render {@link ConversationList} inside a memory router whose history sits on `activePath`, so the
 *  TanStack `<Link>` active state (and thus `aria-current`) resolves against a real router. */
function renderList(activePath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/list',
    component: () => <ConversationList />,
  });
  const conversationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: () => <ConversationList />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute, conversationRoute]),
    history: createMemoryHistory({ initialEntries: [activePath] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  useConversationList.mockReset();
});

describe('ConversationList', () => {
  it('renders a Conversations List nav landmark with a heading and the New conversation button', async () => {
    useConversationList.mockReturnValue({ data: { conversations: [], activeId: null } });
    renderList('/list');
    const nav = await screen.findByRole('navigation', { name: 'Conversations List' });
    expect(within(nav).getByRole('heading', { name: 'Conversations' })).toBeInTheDocument();
    const newButton = within(nav).getByRole('button', { name: 'New conversation' });
    expect(newButton).toBeInTheDocument();
    // The button advertises its Alt+N hotkey so a screen reader announces the shortcut.
    expect(newButton).toHaveAttribute('aria-keyshortcuts', 'Alt+N');
  });

  it('renders no accordion sections but still the New conversation affordance for an empty list', async () => {
    useConversationList.mockReturnValue({ data: { conversations: [], activeId: null } });
    const { container } = renderList('/list');
    const nav = await screen.findByRole('navigation', { name: 'Conversations List' });
    expect(within(nav).getByRole('button', { name: 'New conversation' })).toBeInTheDocument();
    // An empty list builds no sections, so the accordion has no items.
    expect(container.querySelector('[data-slot="accordion"]')?.children.length ?? 0).toBe(0);
  });

  it('renders each conversation as a link in its expanded Recent section, titled by the title', async () => {
    useConversationList.mockReturnValue({
      data: {
        conversations: [
          { id: ID_A, title: 'First chat', updatedAt: 2, pinnedAt: null, revision: 1 },
          { id: ID_B, title: 'Second chat', updatedAt: 1, pinnedAt: null, revision: 1 },
        ],
        activeId: ID_A,
      },
    });
    renderList('/list');
    const recent = await screen.findByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('link', { name: 'First chat' })).toBeInTheDocument();
    expect(within(recent).getByRole('link', { name: 'Second chat' })).toBeInTheDocument();
  });

  it('falls back to a stable label for an empty-title draft', async () => {
    useConversationList.mockReturnValue({
      data: {
        conversations: [{ id: ID_A, title: '', updatedAt: 1, pinnedAt: null, revision: 0 }],
        activeId: null,
      },
    });
    renderList('/list');
    expect(await screen.findByRole('link', { name: 'Untitled conversation' })).toBeInTheDocument();
  });

  it('marks the active conversation link with aria-current="page" (exact match only)', async () => {
    useConversationList.mockReturnValue({
      data: {
        conversations: [
          { id: ID_A, title: 'Active one', updatedAt: 2, pinnedAt: null, revision: 1 },
          { id: ID_B, title: 'Other one', updatedAt: 1, pinnedAt: null, revision: 1 },
        ],
        activeId: ID_A,
      },
    });
    renderList(`/c/${ID_A}`);
    const active = await screen.findByRole('link', { name: 'Active one' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Other one' })).not.toHaveAttribute('aria-current');
  });
});
