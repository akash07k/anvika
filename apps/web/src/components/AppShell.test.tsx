import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';
import { renderWithRouter } from '../test/renderWithRouter';
import type { GlobalShortcutsOptions } from '../hooks/shortcuts/useGlobalShortcuts';

// Mock useGlobalShortcuts so jsdom tests can capture and call onOpen directly - react-hotkeys-hook
// does not fire on fireEvent.keyDown in jsdom (proven by the browser smoke test in
// useGlobalShortcuts.browser.test.tsx). The real hook is exercised in that browser test.
let capturedOnOpen: (() => void) | undefined;
vi.mock('../hooks/shortcuts/useGlobalShortcuts', () => ({
  useGlobalShortcuts: ({ onOpen }: GlobalShortcutsOptions) => {
    capturedOnOpen = onOpen;
  },
}));

describe('AppShell', () => {
  // The router's initial render is async, so the first query in each test awaits via `findBy`.
  it('exposes banner, main, and contentinfo landmarks', async () => {
    renderWithRouter(<AppShell />);
    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('has a skip link to the main region', async () => {
    renderWithRouter(<AppShell />);
    const skip = await screen.findByRole('link', { name: /skip to main/i });
    expect(skip).toHaveAttribute('href', '#main');
  });

  it('renders its children inside main', async () => {
    renderWithRouter(
      <AppShell>
        <p>hello</p>
      </AppShell>,
    );
    expect(await screen.findByText('hello')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('hello');
  });

  it('has a primary nav with Chat and Settings links so Settings is reachable in-app', async () => {
    renderWithRouter(<AppShell />);
    const nav = await screen.findByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    // Mounted at "/", the Chat link is the current page (TanStack sets aria-current automatically).
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page');
  });

  it('mounts the global shortcut hook and opens the wired shortcuts dialog', async () => {
    renderWithRouter(<AppShell />);
    // Wait for the router's async initial render before querying.
    await screen.findByRole('banner');
    // The mock captured onOpen when useGlobalShortcuts was called, proving the hook was mounted.
    expect(capturedOnOpen).toBeDefined();
    // The shadcn (Radix) dialog renders only when open: closed initially, then firing the captured
    // Alt+/ handler reveals the titled listing. (The real key-fire path is covered by the browser
    // test in useGlobalShortcuts.browser.test.tsx.)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      capturedOnOpen?.();
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Keyboard shortcuts');
    expect(screen.getByText('Open keyboard shortcuts: Alt+/')).toBeInTheDocument();
  });
});
