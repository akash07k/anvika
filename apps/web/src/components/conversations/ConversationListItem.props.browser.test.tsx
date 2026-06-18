import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { beforeEach, expect, test, vi } from 'vitest';

import type {
  ConversationListResponse,
  ConversationSummary,
} from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

// Mock the API mutation layer so the inline rename's submit is observable without a server.
const renameConversation = vi.fn<(id: string, title: string) => Promise<void>>();
const deleteConversation = vi.fn<(id: string) => Promise<{ activeId: string | null }>>();
const setPinnedConversation = vi.fn<(id: string, pinned: boolean) => Promise<void>>();
vi.mock('../../lib/conversation/conversationMutations', () => ({
  renameConversation: (id: string, title: string) => renameConversation(id, title),
  deleteConversation: (id: string) => deleteConversation(id),
  setPinnedConversation: (id: string, pinned: boolean) => setPinnedConversation(id, pinned),
  // The row now imports `useBranchConversation`, which pulls these named exports from the mutation
  // module; stub them so the mock provides every name the module resolves. These tests never open the
  // Branch item, so the stubs are inert no-ops.
  branchConversation: vi.fn().mockResolvedValue(undefined),
  setActiveConversation: vi.fn().mockResolvedValue(undefined),
  onConversationConflict: () => ({ isConflict: false }),
}));

// Capture announcements so the rename notice does not require the notifier infrastructure.
vi.mock('../../notifications/announce', () => ({ announce: vi.fn() }));

import { ConversationListItem } from './ConversationListItem';

const ID = 'aaa-111';
const ROW: ConversationSummary = {
  id: ID,
  title: 'My chat',
  updatedAt: 2,
  pinnedAt: 5,
  revision: 1,
};
const LIST: ConversationListResponse = { conversations: [ROW], activeId: ID };

/** Mount one conversation row with the given props inside a router and a primed list cache. */
async function renderRow(props: {
  summary: ConversationSummary;
  sectionId?: string;
  showPinnedSuffix?: boolean;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, { ...LIST, conversations: [props.summary] });
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: () => (
      <ul>
        <ConversationListItem {...props} />
      </ul>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [`/c/${props.summary.id}`] }),
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  renameConversation.mockReset().mockResolvedValue(undefined);
  deleteConversation.mockReset().mockResolvedValue({ activeId: null });
  setPinnedConversation.mockReset().mockResolvedValue(undefined);
});

test('showPinnedSuffix appends "(Pinned)" to the link accessible name', async () => {
  await renderRow({ summary: ROW, showPinnedSuffix: true });
  await expect.element(page.getByRole('link', { name: 'My chat (Pinned)' })).toBeInTheDocument();
});

test('showPinnedSuffix appends "(Pinned)" to the untitled fallback name', async () => {
  await renderRow({ summary: { ...ROW, title: '' }, showPinnedSuffix: true });
  await expect
    .element(page.getByRole('link', { name: 'Untitled conversation (Pinned)' }))
    .toBeInTheDocument();
});

test('without showPinnedSuffix the link name is just the title', async () => {
  await renderRow({ summary: ROW });
  await expect.element(page.getByRole('link', { name: 'My chat' })).toBeInTheDocument();
});

test('sectionId scopes the link DOM id', async () => {
  await renderRow({ summary: ROW, sectionId: 'recent' });
  const link = page.getByRole('link', { name: 'My chat' }).element();
  expect(link.id).toBe(`conversation-link-recent-${ID}`);
});

test('without sectionId the link DOM id stays unscoped', async () => {
  await renderRow({ summary: ROW });
  const link = page.getByRole('link', { name: 'My chat' }).element();
  expect(link.id).toBe(`conversation-link-${ID}`);
});

test('inline rename restores focus to the section-scoped link id', async () => {
  await renderRow({ summary: ROW, sectionId: 'recent' });
  const link = page.getByRole('link', { name: 'My chat' }).element() as HTMLElement;
  link.focus();
  link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Rename' }));
  await userEvent.keyboard('{Escape}');
  // Cancelling restores focus to the same section-scoped link, not an unscoped id.
  await vi.waitFor(() => {
    const restored = document.getElementById(`conversation-link-recent-${ID}`);
    expect(restored).not.toBeNull();
    expect(restored).toHaveFocus();
  });
});
