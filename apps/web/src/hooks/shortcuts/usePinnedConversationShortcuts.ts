import { useRef } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useHotkeys } from 'react-hotkeys-hook';

import { type KeymapAction } from '@anvika/shared/settings/keymap';
import { PINNED_QUICK_NAV_ACTIONS } from '@anvika/shared/settings/keymap-quick-nav';

import { usePinConversation } from '../../components/conversations/usePinConversation';
import { useConversationList } from '../../lib/conversation/conversationQueries';
import { navigateToConversationAndFocusComposer } from '../../lib/conversation/navigateToConversation';
import { focusPinnedConversationRow } from '../../lib/conversation/conversationNavFocus';
import { pinnedConversationsByRecency } from '../../lib/conversation/pinnedConversations';
import { notify } from '../../notifications/notifier';

/** Tags the pinned shortcuts still fire on, so they work while the composer textarea has focus. */
const FORM_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'] as const;

/** What {@link usePinnedConversationShortcuts} needs: the resolved keymap (defaults plus overrides). */
export interface PinnedConversationShortcutsOptions {
  /** The resolved keymap, the single source of the (rebindable) bindings. */
  keymap: Record<KeymapAction, string>;
}

/**
 * Bind the three app-wide pinned-conversation shortcuts, all from the resolved keymap (rebindable):
 * `pinnedQuickNav1`..`0` (Ctrl+Alt+1..0, switch to the Nth-most-recently-pinned conversation, slot 1
 * the newest pin), `focusPinnedConversationList` (Ctrl+Alt+C, move focus into the Pinned section), and
 * `togglePinCurrentConversation` (Ctrl+Alt+P, pin the viewed conversation if unpinned, else unpin it).
 *
 * The pinned slot order comes from {@link pinnedConversationsByRecency} - the SAME helper the Pinned
 * nav section uses - so the visible order and the quick-nav slots never drift. A switch navigates and
 * focuses the composer, then announces the slot; an empty slot, no pinned conversations, or an unsaved
 * draft each speak a content-safe no-op notice and act on nothing. While the conversation list query
 * is still unresolved (e.g. a cold deep-link straight to /c/<id>), every handler instead speaks a
 * distinct "still loading" cue and acts on nothing, so a real conversation is never mistaken for an
 * empty/draft state. Every spoken cue carries ONLY the content-safe slot number - never a
 * conversation id, title, or message text.
 *
 * Bound in the default `*` scope (no `scopes`) with `enableOnFormTags`, so they fire on every route and
 * while the composer has focus - matching the recent-conversation shortcuts.
 *
 * @param options - See {@link PinnedConversationShortcutsOptions}.
 */
export function usePinnedConversationShortcuts({
  keymap,
}: PinnedConversationShortcutsOptions): void {
  const navigate = useNavigate();
  const { data } = useConversationList();
  const viewedId = useParams({ strict: false, select: (params) => params.conversationId });
  const { setPinned } = usePinConversation(viewedId ?? '');
  const opts = { preventDefault: true, enableOnFormTags: FORM_TAGS };

  // `usePinConversation` returns a fresh `setPinned` every render, so depending on it directly in the
  // toggle hotkey would re-register the binding on every render. The ref keeps the binding stable while
  // always invoking the LATEST closure (latest `setPinned`, `viewedId`, and `data`), so the toggle is
  // both stable and current. Reassigned every render below.
  const toggleRef = useRef<() => void>(() => undefined);
  toggleRef.current = () => {
    if (!data) {
      notify({ type: 'conversationListLoading' });
      return;
    }
    const row = viewedId ? data.conversations.find((c) => c.id === viewedId) : undefined;
    if (!row) {
      notify({ type: 'cannotPinEmptyConversation' });
      return;
    }
    // Same key toggles: pin when currently unpinned (`pinnedAt === null`), unpin otherwise.
    void setPinned(row.pinnedAt === null);
  };

  // Quick-switch: one binding per slot - a constant ten iterations (mirrors useConversationShortcuts).
  // Slot N is the Nth-most-recently-pinned conversation, sourced from the shared recency helper.
  PINNED_QUICK_NAV_ACTIONS.forEach((action, index) => {
    const slot = index + 1;
    useHotkeys(
      keymap[action],
      () => {
        if (!data) {
          notify({ type: 'conversationListLoading' });
          return;
        }
        const pinned = pinnedConversationsByRecency(data.conversations);
        const target = pinned[slot - 1];
        if (!target) {
          notify({ type: 'pinnedQuickNavEmpty' });
          return;
        }
        navigateToConversationAndFocusComposer(navigate, target.id);
        notify({ type: 'pinnedConversationSwitched', slot });
      },
      opts,
      [keymap[action], data, navigate],
    );
  });

  useHotkeys(
    keymap.focusPinnedConversationList,
    () => {
      if (!data) {
        notify({ type: 'conversationListLoading' });
        return;
      }
      const pinned = pinnedConversationsByRecency(data.conversations);
      if (pinned.length === 0) {
        notify({ type: 'noPinnedConversations' });
        return;
      }
      focusPinnedConversationRow();
    },
    opts,
    [keymap.focusPinnedConversationList, data],
  );

  useHotkeys(keymap.togglePinCurrentConversation, () => toggleRef.current(), opts, [
    keymap.togglePinCurrentConversation,
  ]);
}
