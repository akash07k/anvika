import { createRootRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '../components/AppShell';
import { useRouteFocus } from '../hooks/focus/useRouteFocus';

/** Root layout: the accessible app shell wrapping the active route's content. */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Persisted across route changes, so it owns focus management when the active route swaps.
  useRouteFocus();
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
