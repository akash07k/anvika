import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { usePinnedConversationShortcuts } from './usePinnedConversationShortcuts';

// Capture navigations from the shared navigate-and-focus helper, and the live route id from useParams.
const navigateMock = vi.fn();
let viewedId: string | undefined;
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  useParams: (opts: { select: (p: { conversationId?: string | undefined }) => unknown }) =>
    opts.select({ conversationId: viewedId }),
}));

// Drive the conversation list from a mutable fixture so each test sets its own rows. `listData` may be
// undefined to exercise the still-loading branch.
type Row = { id: string; pinnedAt: number | null };
let listData: { conversations: Row[] } | undefined;
vi.mock('../../lib/conversation/conversationQueries', () => ({
  useConversationList: () => ({ data: listData }),
}));

// usePinConversation is its own unit; here we only assert the toggle delegates to its setPinned.
const setPinnedMock = vi.fn(() => Promise.resolve(true));
vi.mock('../../components/conversations/usePinConversation', () => ({
  usePinConversation: () => ({ setPinned: setPinnedMock }),
}));

/** A minimal host mounting the hook with the default keymap plus a Pinned-section nav. */
function Harness({ keymap = DEFAULT_KEYMAP }: { keymap?: typeof DEFAULT_KEYMAP }) {
  usePinnedConversationShortcuts({ keymap });
  return (
    <nav aria-label="Conversations List">
      <div id="section-item-pinned">
        <button data-slot="accordion-trigger">Pinned</button>
      </div>
      <a id="conversation-link-pinned-newest" href="/c/newest" aria-current="page">
        Newest pinned
      </a>
    </nav>
  );
}

function renderHarness(keymap = DEFAULT_KEYMAP) {
  return render(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <Harness keymap={keymap} />
    </HotkeysProvider>,
  );
}

const events: NotificationEvent[] = [];

describe('usePinnedConversationShortcuts', () => {
  beforeEach(() => {
    events.length = 0;
    navigateMock.mockClear();
    setPinnedMock.mockClear();
    viewedId = undefined;
    // Two pinned rows (newest pin first by pinnedAt) plus an unpinned one to prove filtering.
    listData = {
      conversations: [
        { id: 'newest', pinnedAt: 9 },
        { id: 'older', pinnedAt: 3 },
        { id: 'unpinned', pinnedAt: null },
      ],
    };
    registerChannel((e) => events.push(e));
  });
  afterEach(() => {
    resetChannels();
  });

  it('Ctrl+Alt+1 switches to the most recently pinned conversation and announces slot 1', async () => {
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}1{/Alt}{/Control}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'newest' },
    });
    expect(events).toContainEqual({ type: 'pinnedConversationSwitched', slot: 1 });
  });

  it('an empty pinned slot announces empty and does NOT navigate', async () => {
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}3{/Alt}{/Control}');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'pinnedQuickNavEmpty' });
  });

  it('Ctrl+Alt+C with pinned conversations focuses the Pinned section without announcing no-pinned', async () => {
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}c{/Alt}{/Control}');
    expect(document.getElementById('conversation-link-pinned-newest')).toHaveFocus();
    expect(events).not.toContainEqual({ type: 'noPinnedConversations' });
  });

  it('Ctrl+Alt+C with no pinned conversations announces noPinnedConversations', async () => {
    listData = { conversations: [{ id: 'unpinned', pinnedAt: null }] };
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}c{/Alt}{/Control}');
    expect(events).toContainEqual({ type: 'noPinnedConversations' });
  });

  it('Ctrl+Alt+P on a viewed persisted conversation toggles its pinned state', async () => {
    viewedId = 'unpinned'; // pinnedAt null -> pin (true)
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}p{/Alt}{/Control}');
    expect(setPinnedMock).toHaveBeenCalledWith(true);
  });

  it('Ctrl+Alt+P unpins a viewed pinned conversation', async () => {
    viewedId = 'newest'; // pinnedAt 9 -> unpin (false)
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}p{/Alt}{/Control}');
    expect(setPinnedMock).toHaveBeenCalledWith(false);
  });

  it('Ctrl+Alt+P on an unsaved/absent id announces cannotPinEmptyConversation without pinning', async () => {
    viewedId = undefined;
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}p{/Alt}{/Control}');
    expect(setPinnedMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'cannotPinEmptyConversation' });
  });

  it('a pinned quick-nav slot while the list is still loading announces loading and does NOT navigate', async () => {
    listData = undefined; // query unresolved (e.g. a cold deep-link straight to /c/<id>)
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}1{/Alt}{/Control}');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'conversationListLoading' });
    expect(events).not.toContainEqual({ type: 'pinnedQuickNavEmpty' });
  });

  it('Ctrl+Alt+C while the list is still loading announces loading and does NOT focus', async () => {
    listData = undefined;
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}c{/Alt}{/Control}');
    expect(events).toContainEqual({ type: 'conversationListLoading' });
    expect(events).not.toContainEqual({ type: 'noPinnedConversations' });
  });

  it('Ctrl+Alt+P on a real conversation while the list is still loading announces loading, not cannot-pin-empty', async () => {
    listData = undefined; // a real, persisted conversation whose row has not loaded yet
    viewedId = 'newest';
    renderHarness();
    await userEvent.keyboard('{Control>}{Alt>}p{/Alt}{/Control}');
    expect(setPinnedMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'conversationListLoading' });
    expect(events).not.toContainEqual({ type: 'cannotPinEmptyConversation' });
  });

  it('binds from the keymap (rebindable): a remapped pinned quick-nav uses the override key', async () => {
    renderHarness({ ...DEFAULT_KEYMAP, pinnedQuickNav1: 'ctrl+alt+9' });
    await userEvent.keyboard('{Control>}{Alt>}9{/Alt}{/Control}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'newest' },
    });
  });
});
