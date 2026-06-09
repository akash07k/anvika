import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import { CONVERSATIONS_HEADING_ID } from '../../components/conversations/sectionRowFocus';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useConversationShortcuts } from './useConversationShortcuts';

// Capture navigations from the shared navigate-and-focus helper (it calls useNavigate's result).
const navigateMock = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}));

// Drive the conversation list slots from a mutable fixture so each test sets its own rows. A test can
// also set `listData` to `undefined` to exercise the still-loading branch (no list data yet).
let listConversations: Array<{ id: string }> = [];
let listData: { conversations: Array<{ id: string }> } | undefined;
vi.mock('../../lib/conversation/conversationQueries', () => ({
  useConversationList: () => ({ data: listData }),
}));

// createConversation is its own unit; here we only assert the hook delegates to it on Alt+N.
const createConversationMock = vi.fn();
vi.mock('../conversation/useNewConversation', () => ({
  useNewConversation: () => ({ createConversation: createConversationMock }),
}));

/** A minimal host mounting the hook with the default keymap plus a conversation-list nav. */
function Harness({
  keymap = DEFAULT_KEYMAP,
  openAdvancedNew,
}: {
  keymap?: typeof DEFAULT_KEYMAP;
  openAdvancedNew?: () => void;
}) {
  useConversationShortcuts({ keymap, ...(openAdvancedNew ? { openAdvancedNew } : {}) });
  return (
    <nav aria-label="Conversations List">
      <h2 id={CONVERSATIONS_HEADING_ID} tabIndex={-1}>
        Conversations
      </h2>
      <a id="conversation-link-recent-a" href="/c/first">
        Row A
      </a>
      <a id="conversation-link-recent-b" href="/c/second" aria-current="page">
        Row B
      </a>
    </nav>
  );
}

function renderHarness(keymap = DEFAULT_KEYMAP, openAdvancedNew?: () => void) {
  return render(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <Harness keymap={keymap} {...(openAdvancedNew ? { openAdvancedNew } : {})} />
    </HotkeysProvider>,
  );
}

const events: NotificationEvent[] = [];

describe('useConversationShortcuts', () => {
  beforeEach(() => {
    events.length = 0;
    navigateMock.mockClear();
    createConversationMock.mockClear();
    listConversations = [{ id: 'first' }, { id: 'second' }];
    listData = { conversations: listConversations };
    registerChannel((e) => events.push(e));
  });
  afterEach(() => {
    resetChannels();
  });

  it('Alt+N delegates to createConversation', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}n{/Alt}');
    expect(createConversationMock).toHaveBeenCalledTimes(1);
  });

  it('Alt+Shift+C focuses the active conversation row', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}{Shift>}c{/Shift}{/Alt}');
    expect(document.getElementById('conversation-link-recent-b')).toHaveFocus();
  });

  it('Alt+Shift+1 switches to the most recent conversation and announces slot 1', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}{Shift>}1{/Shift}{/Alt}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'first' },
    });
    expect(events).toContainEqual({ type: 'conversationSwitched', slot: 1 });
  });

  it('Alt+Shift+2 switches to the 2nd most recent conversation and announces slot 2', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}{Shift>}2{/Shift}{/Alt}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'second' },
    });
    expect(events).toContainEqual({ type: 'conversationSwitched', slot: 2 });
  });

  it('an out-of-range slot announces empty and does NOT navigate', async () => {
    listData = { conversations: [{ id: 'only' }] };
    renderHarness();
    await userEvent.keyboard('{Alt>}{Shift>}3{/Shift}{/Alt}');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'conversationQuickNavEmpty' });
  });

  it('while the list is still loading, a quick-nav slot announces empty and does NOT navigate', async () => {
    // `data` is undefined until the list query resolves; the `data?.conversations[...]` branch must
    // treat that as an empty slot (no navigation), not throw.
    listData = undefined;
    renderHarness();
    await userEvent.keyboard('{Alt>}{Shift>}1{/Shift}{/Alt}');
    expect(navigateMock).not.toHaveBeenCalled();
    expect(events).toContainEqual({ type: 'conversationQuickNavEmpty' });
  });

  it('binds from the keymap (rebindable): a remapped quick-nav uses the override key', async () => {
    renderHarness({ ...DEFAULT_KEYMAP, conversationQuickNav1: 'alt+shift+9' });
    await userEvent.keyboard('{Alt>}{Shift>}9{/Shift}{/Alt}');
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/c/$conversationId',
      params: { conversationId: 'first' },
    });
  });

  it('Alt+Shift+N calls the openAdvancedNew handler', async () => {
    const openAdvancedNew = vi.fn();
    renderHarness(DEFAULT_KEYMAP, openAdvancedNew);
    await userEvent.keyboard('{Alt>}{Shift>}n{/Shift}{/Alt}');
    expect(openAdvancedNew).toHaveBeenCalledTimes(1);
  });

  it('Alt+Shift+N is a no-op when openAdvancedNew is not provided', async () => {
    // No openAdvancedNew - the binding fires but the optional call is swallowed.
    renderHarness(DEFAULT_KEYMAP);
    // Should not throw.
    await userEvent.keyboard('{Alt>}{Shift>}n{/Shift}{/Alt}');
  });
});
