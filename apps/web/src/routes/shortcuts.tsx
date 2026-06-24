import { createFileRoute } from '@tanstack/react-router';

import { ShortcutsView } from '../components/ShortcutsView';

/** The keyboard-shortcuts route: the read-only cheatsheet under a page heading. */
export const Route = createFileRoute('/shortcuts')({
  component: ShortcutsView,
});
