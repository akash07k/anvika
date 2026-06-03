import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import type { ReactElement } from 'react';

/** Options for {@link renderWithRouter}. */
export interface RenderWithRouterOptions {
  /** The in-memory location to start at. Defaults to `/`. */
  initialLocation?: string;
}

/**
 * Render a component that uses TanStack Router primitives (e.g. `<Link>`) inside a real in-memory
 * router, so client-side navigation resolves exactly as in the app - no full page reload and no
 * "router context missing" error. The component under test mounts at `/`; a stub `/settings` route is
 * present so a `<Link to="/settings">` has a real target to resolve and navigate to. This is the
 * reusable harness for any component that links between routes (the no-model Settings link and the
 * {@link AppShell} primary nav). The router's initial render is async, so a consuming test should
 * await the first query with `findBy*` before using synchronous `getBy*`.
 *
 * A fresh, retry-disabled {@link QueryClient} wraps the router so a component that reads a TanStack
 * Query (e.g. {@link AppShell} via the conversation list) resolves its client; the client is per-call
 * so cache state never leaks between tests, and `retry: false` keeps a failed/unmocked query from
 * retrying in the background.
 *
 * @param ui - The element under test (already wrapped in any other providers it needs, e.g. a
 *   `HotkeysProvider`).
 * @param options - {@link RenderWithRouterOptions}.
 * @returns Testing Library's render result, augmented with the test `router` for asserting
 *   `router.state.location`.
 */
export function renderWithRouter(
  ui: ReactElement,
  options: RenderWithRouterOptions = {},
): RenderResult & { router: AnyRouter } {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    // The host route renders the component under test; closing over `ui` is intentional here.
    // oxlint-disable-next-line react/no-unstable-nested-components
    component: () => ui,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <h1>Settings</h1>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: [options.initialLocation ?? '/'] }),
  });
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
    router,
  };
}
