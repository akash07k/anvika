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
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type {
  ConversationListResponse,
  ConversationSummary,
} from '@anvika/shared/conversation/responses';

import { conversationsListKey } from '../../lib/conversation/conversationQueries';

// Mock the API mutation layer so the row's actions are observable without a server. `renameConversation`
// resolves (204); `deleteConversation` returns a resulting active id.
const renameConversation = vi.fn<(id: string, title: string) => Promise<void>>();
const deleteConversation = vi.fn<(id: string) => Promise<{ activeId: string | null }>>();
const setPinnedConversation = vi.fn<(id: string, pinned: boolean) => Promise<void>>();
const branchConversation =
  vi.fn<(sourceId: string, newId: string, baseRevision: number) => Promise<void>>();
const setActiveConversation = vi.fn<(id: string) => Promise<void>>();
vi.mock('../../lib/conversation/conversationMutations', () => ({
  renameConversation: (id: string, title: string) => renameConversation(id, title),
  deleteConversation: (id: string) => deleteConversation(id),
  setPinnedConversation: (id: string, pinned: boolean) => setPinnedConversation(id, pinned),
  branchConversation: (sourceId: string, newId: string, baseRevision: number) =>
    branchConversation(sourceId, newId, baseRevision),
  setActiveConversation: (id: string) => setActiveConversation(id),
  onConversationConflict: () => ({ isConflict: false }),
}));

// Capture announcements so the content-safe rename/delete notices are observable.
const announce = vi.fn();
vi.mock('../../notifications/announce', () => ({
  announce: (m: string, p: string) => announce(m, p),
}));

import { speechChannel } from '../../notifications/channels/speech';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { ConversationListItem } from './ConversationListItem';
import { NewConversationButton } from './NewConversationButton';

const ID = 'aaa-111';
const OTHER_ID = 'bbb-222';
const ROW: ConversationSummary = {
  id: ID,
  title: 'My chat',
  updatedAt: 2,
  pinnedAt: null,
  revision: 1,
};
const LIST: ConversationListResponse = {
  conversations: [
    ROW,
    { id: OTHER_ID, title: 'Other chat', updatedAt: 1, pinnedAt: null, revision: 1 },
  ],
  activeId: ID,
};

/** Mount one conversation row inside a router (with the `/c/:id` route) and a primed list cache. */
async function renderRow(initialLocation = `/c/${ID}`, summary = ROW) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(conversationsListKey, LIST);
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const listRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: () => (
      <>
        <NewConversationButton />
        <ul>
          <ConversationListItem summary={summary} />
        </ul>
      </>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([listRoute]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

/** Open the row's context menu by dispatching `contextmenu` on the focused link (Applications key). */
function openMenu(): void {
  const link = page.getByRole('link', { name: 'My chat' }).element() as HTMLElement;
  link.focus();
  link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
}

beforeEach(() => {
  renameConversation.mockReset().mockResolvedValue(undefined);
  deleteConversation.mockReset().mockResolvedValue({ activeId: OTHER_ID });
  setPinnedConversation.mockReset().mockResolvedValue(undefined);
  branchConversation.mockReset().mockResolvedValue(undefined);
  setActiveConversation.mockReset().mockResolvedValue(undefined);
  announce.mockClear();
  resetChannels();
  registerChannel(speechChannel);
});

afterEach(() => {
  resetChannels();
});

test('the row link is the context-menu trigger and offers Rename and Delete', async () => {
  await renderRow();
  await expect.element(page.getByRole('link', { name: 'My chat' })).toBeInTheDocument();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
  await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
});

test('an unpinned row offers Pin, and activating it pins the conversation', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
  await userEvent.click(page.getByRole('menuitem', { name: 'Pin' }));
  await vi.waitFor(() => expect(setPinnedConversation).toHaveBeenCalledWith(ID, true));
});

test('a pinned row offers Unpin, and activating it unpins the conversation', async () => {
  await renderRow(`/c/${ID}`, { ...ROW, pinnedAt: 5 });
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument();
  await userEvent.click(page.getByRole('menuitem', { name: 'Unpin' }));
  await vi.waitFor(() => expect(setPinnedConversation).toHaveBeenCalledWith(ID, false));
});

test('the row offers Branch, and activating it branches the conversation', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Branch' })).toBeInTheDocument();
  await userEvent.click(page.getByRole('menuitem', { name: 'Branch' }));
  await vi.waitFor(() =>
    expect(branchConversation).toHaveBeenCalledWith(ID, expect.any(String), expect.any(Number)),
  );
});

test('each menuitem exposes its accelerator via aria-keyshortcuts without changing its name', async () => {
  await renderRow();
  openMenu();
  await expect
    .element(page.getByRole('menuitem', { name: 'Pin' }))
    .toHaveAttribute('aria-keyshortcuts', 'P');
  await expect
    .element(page.getByRole('menuitem', { name: 'Branch' }))
    .toHaveAttribute('aria-keyshortcuts', 'B');
  await expect
    .element(page.getByRole('menuitem', { name: 'Rename' }))
    .toHaveAttribute('aria-keyshortcuts', 'R');
  await expect
    .element(page.getByRole('menuitem', { name: 'Delete' }))
    .toHaveAttribute('aria-keyshortcuts', 'D');
});

test('pressing p activates Pin and closes the menu', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
  await userEvent.keyboard('p');
  await vi.waitFor(() => expect(setPinnedConversation).toHaveBeenCalledWith(ID, true));
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).not.toBeInTheDocument();
});

test('pressing b branches the conversation', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Branch' })).toBeInTheDocument();
  await userEvent.keyboard('b');
  await vi.waitFor(() =>
    expect(branchConversation).toHaveBeenCalledWith(ID, expect.any(String), expect.any(Number)),
  );
});

test('pressing r enters inline rename', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
  await userEvent.keyboard('r');
  await expect
    .element(page.getByRole('textbox', { name: 'Rename conversation' }))
    .toBeInTheDocument();
});

test('pressing d opens the delete confirmation', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  await userEvent.keyboard('d');
  await expect
    .element(page.getByRole('alertdialog', { name: 'Delete conversation?' }))
    .toBeInTheDocument();
});

test('a modifier + accelerator combo is not intercepted and the menu stays open', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
  await userEvent.keyboard('{Control>}p{/Control}');
  expect(setPinnedConversation).not.toHaveBeenCalled();
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
});

test('a pinned row exposes U and pressing u unpins it', async () => {
  await renderRow(`/c/${ID}`, { ...ROW, pinnedAt: 5 });
  openMenu();
  await expect
    .element(page.getByRole('menuitem', { name: 'Unpin' }))
    .toHaveAttribute('aria-keyshortcuts', 'U');
  await userEvent.keyboard('u');
  await vi.waitFor(() => expect(setPinnedConversation).toHaveBeenCalledWith(ID, false));
});

test('the open row context menu has no axe violations', async () => {
  await renderRow();
  openMenu();
  await expect.element(page.getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument();
  // Audit the menu content itself (the novel ARIA surface: menuitems, aria-keyshortcuts, the
  // aria-hidden shortcut spans), not the whole body. While the menu is open Radix marks the rest of
  // the page `aria-hidden` to trap focus - auditing the body would flag that background's focusable
  // elements (`aria-hidden-focus`), which is Radix's own modal behavior, not this feature's concern.
  // `target-size` is disabled for the same reason as the sectioned-nav axe test (no CSS in this render).
  const menu = page.getByRole('menu').element();
  const results = await axe.run(menu, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    rules: { 'target-size': { enabled: false } },
  });
  expect(results.violations).toEqual([]);
});

test('Rename swaps the link for an inline field, submits, announces, and updates the cache', async () => {
  const { queryClient } = await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Rename' }));

  const input = page.getByRole('textbox', { name: 'Rename conversation' });
  await expect.element(input).toHaveValue('My chat');
  // The field's deferred mount-focus must win the context menu's trigger-focus restore, so the
  // keyboard lands in the input rather than on the unmounting link / <body>.
  await expect.element(input).toHaveFocus();
  await userEvent.fill(input, 'Renamed chat');
  await userEvent.keyboard('{Enter}');

  await vi.waitFor(() => expect(renameConversation).toHaveBeenCalledWith(ID, 'Renamed chat'));
  await vi.waitFor(() => expect(announce).toHaveBeenCalledWith('Conversation renamed', 'high'));
  // Optimistic cache update: the list row's title is the new one.
  const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
  expect(list?.conversations.find((c) => c.id === ID)?.title).toBe('Renamed chat');
});

test('an empty rename title does not submit (schema would reject it)', async () => {
  await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Rename' }));
  const input = page.getByRole('textbox', { name: 'Rename conversation' });
  await userEvent.fill(input, '   ');
  await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await userEvent.keyboard('{Enter}');
  expect(renameConversation).not.toHaveBeenCalled();
});

test('Delete opens a destructive confirm naming the conversation; confirming deletes and announces', async () => {
  await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));

  const dialog = page.getByRole('alertdialog', { name: 'Delete conversation?' });
  await expect.element(dialog).toBeInTheDocument();
  // The title is shown (content-safe in the UI) so the user knows what they delete.
  await expect.element(dialog).toHaveTextContent('My chat');

  await userEvent.click(page.getByRole('button', { name: 'Delete' }));
  await vi.waitFor(() => expect(deleteConversation).toHaveBeenCalledWith(ID));
  await vi.waitFor(() => expect(announce).toHaveBeenCalledWith('Conversation deleted', 'high'));
  // The deleted row's link (the dialog opener) is gone, so focus moves to the New conversation button
  // rather than falling to <body>.
  await expect
    .element(page.getByRole('button', { name: 'New conversation', exact: true }))
    .toHaveFocus();
});

test('cancelling the delete confirm does not delete', async () => {
  await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  await expect
    .element(page.getByRole('alertdialog', { name: 'Delete conversation?' }))
    .not.toBeInTheDocument();
  expect(deleteConversation).not.toHaveBeenCalled();
});

test('a failed rename rolls back the optimistic title and announces the failure (not success)', async () => {
  renameConversation.mockRejectedValue(new Error('network down'));
  const { queryClient } = await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Rename' }));
  await userEvent.fill(page.getByRole('textbox', { name: 'Rename conversation' }), 'Renamed chat');
  await userEvent.keyboard('{Enter}');

  await vi.waitFor(() =>
    expect(announce).toHaveBeenCalledWith(
      'Could not rename the conversation. Please try again.',
      'high',
    ),
  );
  // The optimistic title is rolled back to the original in the cache, and success is never announced.
  const list = queryClient.getQueryData<ConversationListResponse>(conversationsListKey);
  expect(list?.conversations.find((c) => c.id === ID)?.title).toBe('My chat');
  expect(announce).not.toHaveBeenCalledWith('Conversation renamed', 'high');
});

test('a failed delete announces the failure and returns focus to the surviving row', async () => {
  deleteConversation.mockRejectedValue(new Error('network down'));
  await renderRow();
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(page.getByRole('button', { name: 'Delete' }));

  await vi.waitFor(() =>
    expect(announce).toHaveBeenCalledWith(
      'Could not delete the conversation. Please try again.',
      'high',
    ),
  );
  expect(announce).not.toHaveBeenCalledWith('Conversation deleted', 'high');
  // The delete failed, so the row was NOT removed; focus returns to its link rather than jumping away.
  await expect.element(page.getByRole('link', { name: 'My chat' })).toHaveFocus();
});

test('deleting the viewed conversation navigates to the server active id', async () => {
  const { router } = await renderRow(`/c/${ID}`);
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(page.getByRole('button', { name: 'Delete' }));

  await vi.waitFor(() => expect(deleteConversation).toHaveBeenCalledWith(ID));
  await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/c/${OTHER_ID}`));
});

test('deleting a non-viewed conversation leaves the route unchanged', async () => {
  // View OTHER_ID; the rendered row is ID, so deleting it is a delete of a conversation not on screen.
  const { router } = await renderRow(`/c/${OTHER_ID}`);
  openMenu();
  await userEvent.click(page.getByRole('menuitem', { name: 'Delete' }));
  await userEvent.click(page.getByRole('button', { name: 'Delete' }));

  await vi.waitFor(() => expect(deleteConversation).toHaveBeenCalledWith(ID));
  // viewedId (OTHER_ID) is not the deleted id, so the route must stay put.
  expect(router.state.location.pathname).toBe(`/c/${OTHER_ID}`);
});
