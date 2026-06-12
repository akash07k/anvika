import { useEffect } from 'react';

/**
 * Set the document title for the current route. Anvika is a client-only SPA whose static `<head>`
 * lives in `index.html`; TanStack Router's `head`/`HeadContent` API is SSR-oriented, so a small effect
 * that updates `document.title` is the simplest, directly-testable way to reflect the current page -
 * which a screen reader announces on navigation, so getting it right matters for orientation.
 *
 * @param title - The full document title to set (e.g. `'Settings - Anvika'`).
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
