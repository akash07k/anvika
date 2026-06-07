import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';

/** Delay (ms) before moving focus, so the new route's content has mounted. Mirrors the chat focus delay. */
const ROUTE_FOCUS_DELAY_MS = 50;

/**
 * Move focus into the newly navigated page on every client-side route change (after the initial
 * load). Focus goes to the page's first heading - so a screen reader names the page (e.g. "Settings,
 * heading level 1") through the focus move itself and the user lands at the top of the new content; a
 * route with no heading yet falls back to the main region. No separate announcement is made: moving
 * focus already speaks the target, so an extra `announce()` would double up. Every route is expected
 * to render its title `h1` in all states (e.g. the `/c/:id` conversation route renders "Conversation"
 * while loading and on error) so focus reliably lands on the page name. The initial render is skipped so
 * first load does not steal focus from the top of the document (the skip link).
 *
 * This fixes two screen-reader defects of single-page navigation: the activated nav link keeps focus
 * and the screen reader re-announces its own "current page" state, and the destination page is never
 * named. Moving focus off the link onto the page heading resolves both.
 */
export function useRouteFocus(): void {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // The path at mount; focus only moves when the path genuinely CHANGES from it. Guarding on a real
  // change (not a first-render flag) also survives React StrictMode's double-invoked effects in dev,
  // which would defeat a boolean "is initial" ref and steal focus on load.
  const previous = useRef(pathname);
  useEffect(() => {
    if (pathname === previous.current) return undefined;
    previous.current = pathname;
    const timer = setTimeout(() => {
      // Yield to an intentional composer-focus navigation: a new conversation, the advanced-dialog
      // create, or a quick-switch records a one-shot intent that the destination composer consumes on
      // mount (see `composerFocusIntent`). If that composer already claimed focus, moving focus to the
      // heading here would steal it back, defeating the intent - so leave it. Scoped narrowly to the
      // composer (not any `#main` focus) so list/branch/Settings navigations still get the H1 named.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.id === 'composer') return;
      const main = document.getElementById('main');
      // Relies on the page's own title `h1` being the FIRST `h1` in `#main`, which holds because
      // assistant-markdown headings are offset to `h3`+ (ADR 0014), so no other `h1` appears there.
      const heading = main?.querySelector('h1');
      const target = heading instanceof HTMLElement ? heading : main;
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus(); // the screen reader reads the focused target - the heading names the page
    }, ROUTE_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pathname]);
}
