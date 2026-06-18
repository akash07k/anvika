import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { expect, it } from 'vitest';

import { useRouteFocus } from './useRouteFocus';

/** The persistent root layout under test: it mounts {@link useRouteFocus} and a `#main` region. */
function Root() {
  useRouteFocus();
  return (
    <>
      <nav aria-label="Primary">
        <Link to="/">Home</Link>
        <Link to="/settings">Settings</Link>
      </nav>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}

/** A minimal app whose persistent root mounts {@link useRouteFocus}; `/empty` deliberately has no `h1`. */
function buildRouter(initialLocation: string) {
  const rootRoute = createRootRoute({ component: Root });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>Conversation</h1>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <h1>Settings</h1>,
  });
  const emptyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/empty',
    component: () => <p>No heading yet</p>,
  });
  // A conversation-like route that, on arrival, focuses its composer itself (the real surface does
  // this via a one-shot focus intent). `autoFocus` stands in for that mount-time composer focus.
  const composerRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/composer',
    component: () => (
      <>
        <h1>Conversation</h1>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- emulating the composer's mount focus */}
        <textarea id="composer" aria-label="Message" autoFocus />
      </>
    ),
  });
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute, emptyRoute, composerRoute]),
    history: createMemoryHistory({ initialEntries: [initialLocation] }),
  });
}

it('does not steal focus on the initial render (even under StrictMode double-effects)', async () => {
  render(
    <StrictMode>
      <RouterProvider router={buildRouter('/')} />
    </StrictMode>,
  );
  await screen.findByRole('heading', { name: 'Conversation', level: 1 });
  // Wait past the focus delay so a regressed guard (which would schedule a timer) is actually caught.
  await new Promise((resolve) => setTimeout(resolve, 90));
  expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: 'Conversation' }));
  expect(document.getElementById('main')).not.toBe(document.activeElement);
});

it('moves focus to the new page heading on client navigation', async () => {
  render(
    <StrictMode>
      <RouterProvider router={buildRouter('/')} />
    </StrictMode>,
  );
  await screen.findByRole('heading', { name: 'Conversation', level: 1 });
  await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Settings', level: 1 }),
    ),
  );
});

it('yields to an intentional composer focus: does not steal focus to the heading when the composer holds it', async () => {
  // The destination focuses its composer on arrival (here via autoFocus). useRouteFocus must NOT
  // move focus to the page heading 50ms later, or the new-conversation / advanced-dialog / quick-switch
  // composer-focus intent would be defeated.
  const router = buildRouter('/');
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  await screen.findByRole('heading', { name: 'Conversation', level: 1 });
  router.history.push('/composer'); // test-only path: navigate via the string history API
  const composer = await screen.findByRole('textbox', { name: 'Message' });
  await waitFor(() => expect(document.activeElement).toBe(composer));
  // Wait past the 50ms route-focus timer and confirm focus is STILL on the composer, not the heading.
  await new Promise((resolve) => setTimeout(resolve, 90));
  expect(document.activeElement).toBe(composer);
});

it('falls back to focusing the main region when a route has no heading', async () => {
  // Safety net for a (future) heading-less route: focus still leaves the nav link and lands in
  // content. `/empty` is test-only, so navigate via the router instance (the typed `<Link>`/`to` is
  // validated against the registered app router, which has no such path).
  const router = buildRouter('/');
  render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
  await screen.findByRole('heading', { name: 'Conversation', level: 1 });
  router.history.push('/empty'); // string history API: not typed against the registered app router
  await waitFor(() => expect(document.getElementById('main')).toBe(document.activeElement));
});
