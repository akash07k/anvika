import { Link } from '@tanstack/react-router';

import { useDocumentTitle } from '../hooks/settings/useDocumentTitle';

import { KeyboardShortcuts } from './KeyboardShortcuts';

/**
 * The bookmarkable `/shortcuts` page: the canonical {@link KeyboardShortcuts} listing
 * under a page `<h1>`, plus a "Back to chat" link. Lives in `components/` (not the route file) so
 * the route module exports only its `Route`, keeping it code-splittable (the same pattern as
 * {@link SettingsView}). This route is the future home of the rebinding UI.
 *
 * The page `<h1>` is the single heading; the inner {@link KeyboardShortcuts} renders no heading of its
 * own, so the listing sits directly under the `<h1>` with no duplicate title.
 *
 * @returns The shortcuts page view.
 */
export function ShortcutsView() {
  useDocumentTitle('Keyboard shortcuts - Anvika');
  return (
    <section aria-label="Keyboard shortcuts">
      <h1>Keyboard shortcuts</h1>
      <KeyboardShortcuts />
      <Link to="/">Back to chat</Link>
    </section>
  );
}
