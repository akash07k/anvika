import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useParams,
} from '@tanstack/react-router';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { afterEach, expect, test, vi } from 'vitest';

import type { ConversationListResponse } from '@anvika/shared/conversation/responses';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import { Composer } from '../Composer';

// An empty conversation list keeps the create flow deterministic: every minted draft id is unique.
const EMPTY_LIST: ConversationListResponse = { conversations: [], activeId: null };
// Mock only `useConversationList`; the conversation row's rename/delete hooks (rendered for any list
// row) import the cache key and invalidate helper from this same module, so the real exports must be
// preserved even though this list is empty.
vi.mock('../../lib/conversation/conversationQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/conversation/conversationQueries')>()),
  useConversationList: () => ({ data: EMPTY_LIST }),
}));

import { AppShell } from '../AppShell';

/** The conversation route component: reads its own conversationId param from the router and
 *  passes it to the real Composer so it can consume the focus intent set by navigate-and-focus.
 *  Without the id, the id-scoped intent would never match and focus would not fire. */
function ConversationRouteComponent() {
  const conversationId = useParams({
    strict: false,
    select: (p: { conversationId?: string }) => p.conversationId,
  });
  return (
    <main className="flex-1" id="main" tabIndex={-1}>
      <h1>Conversation</h1>
      {/* Use the real Composer so it can consume the focus intent set by navigate-and-focus.
          Spread conversationId only when defined: exactOptionalPropertyTypes rejects undefined. */}
      <Composer
        {...(conversationId !== undefined ? { conversationId } : {})}
        disabled={false}
        onSend={() => {}}
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
      />
    </main>
  );
}

/** A conversation route that renders the real `Composer` (accessible name "Message"), the focus target
 *  the create action moves to after navigating. The index route has no composer, so a successful
 *  navigation-plus-focus is observable as the composer becoming the active element. */
function buildApp() {
  const rootRoute = createRootRoute({
    component: () => (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Home</h1>,
  });
  const conversationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/c/$conversationId',
    component: ConversationRouteComponent,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, conversationRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
}

/** Render the app at `/`, wrapped in the providers the create action and hotkeys need. */
async function renderApp() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider initiallyActiveScopes={['*']}>
        <RouterProvider router={buildApp()} />
      </HotkeysProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('clicking New conversation creates a conversation and focuses the composer', async () => {
  const screen = await renderApp();
  await userEvent.click(screen.getByRole('button', { name: 'New conversation', exact: true }));
  const composer = screen.getByRole('textbox', { name: 'Message' });
  await expect.element(composer).toHaveFocus();
});

test('pressing Alt+N creates a conversation and focuses the composer', async () => {
  const screen = await renderApp();
  // Move focus into the body, then press the hotkey from anywhere (the global `*` scope binding).
  await userEvent.click(screen.getByRole('heading', { name: 'Home' }));
  await userEvent.keyboard('{Alt>}n{/Alt}');
  const composer = screen.getByRole('textbox', { name: 'Message' });
  await expect.element(composer).toHaveFocus();
});
