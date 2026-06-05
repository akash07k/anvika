import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { useConversationShortcuts } from '../hooks/shortcuts/useConversationShortcuts';
import { useGlobalShortcuts } from '../hooks/shortcuts/useGlobalShortcuts';
import { usePinnedConversationShortcuts } from '../hooks/shortcuts/usePinnedConversationShortcuts';
import { useKeymap } from '../hooks/shortcuts/useKeymap';
import { AdvancedNewConversationDialog } from './conversations/AdvancedNewConversationDialog';
import { ConversationList } from './conversations/ConversationList';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

/** Props for the {@link AppShell} layout component. */
export interface AppShellProps {
  /** Page content rendered inside the `main` landmark. */
  children?: ReactNode;
}

/**
 * The accessible landmark layout for the app: a skip link, a banner with the
 * primary navigation, the `main` region, and a status footer. The primary nav is the in-app way to
 * reach Settings and return to the conversation; TanStack Router marks the current destination with
 * `aria-current="page"` automatically, and the `Chat` link uses an exact match so it is only current
 * on the conversation route (`/` is a prefix of every path).
 *
 * Also owns the global `openKeyboardShortcuts` hotkey: the dialog state lives here so the
 * shortcut works on every route without the chat surface having to know about it. The always-on
 * conversation shortcuts - `newConversation` (Alt+N), `focusConversationList` (Alt+Shift+C), and the
 * `conversationQuickNav1`..`0` quick-switch (Alt+Shift+1..0) - are owned by
 * {@link useConversationShortcuts}, so they fire from any route and even while the composer has focus.
 * The pinned-conversation shortcuts - `pinnedQuickNav1`..`0` (Ctrl+Alt+1..0),
 * `focusPinnedConversationList` (Ctrl+Alt+C), and `togglePinCurrentConversation` (Ctrl+Alt+P) - are
 * owned app-wide here too, by {@link usePinnedConversationShortcuts}, with the same always-on reach.
 */
export function AppShell({ children }: AppShellProps) {
  const keymap = useKeymap();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [advancedNewOpen, setAdvancedNewOpen] = useState(false);
  useGlobalShortcuts({
    binding: keymap.openKeyboardShortcuts,
    onOpen: () => setShortcutsOpen(true),
  });
  useConversationShortcuts({ keymap, openAdvancedNew: () => setAdvancedNewOpen(true) });
  usePinnedConversationShortcuts({ keymap });
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to main content
      </a>
      <header className="border-b">
        <span className="font-semibold">Anvika</span>
        <nav aria-label="Primary">
          <Link to="/" activeOptions={{ exact: true }}>
            Chat
          </Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <div className="flex flex-1">
        <ConversationList onOpenAdvancedNew={() => setAdvancedNewOpen(true)} />
        <main id="main" tabIndex={-1} className="flex-1">
          {children}
        </main>
      </div>
      <footer aria-label="Status" className="border-t text-sm">
        <span>Ready</span>
      </footer>
      <KeyboardShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <AdvancedNewConversationDialog open={advancedNewOpen} onOpenChange={setAdvancedNewOpen} />
    </div>
  );
}
