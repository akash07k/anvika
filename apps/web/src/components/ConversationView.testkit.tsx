/**
 * Shared test harness for ConversationView test siblings.
 *
 * Each sibling file re-declares its own `vi.mock(...)` calls (vitest hoists
 * mocks per-file) and imports the non-mock pieces from here.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, type Mock, vi } from 'vitest';

import { reportClientError } from '../diagnostics/reportClientError';
import type { NotificationEvent } from '../notifications/events';
import { registerChannel, resetChannels } from '../notifications/notifier';

// Explicit `Mock` annotations: the inferred `vi.fn()` type names internal vitest symbols that are
// not portable across this module boundary (TS2883), so annotate the exported spies directly.
/** The send spy, shared with `state.sendMessage` so a test can assert the send call. */
export const sendMessage: Mock = vi.fn();
/** The stop spy, shared with `state.stop`. */
export const stop: Mock = vi.fn();
/** The regenerate spy, shared with `state.regenerate`. */
export const regenerate: Mock = vi.fn();
/** The setMessages spy, shared with `state.setMessages` so the cross-tab sync hook has a callable target. */
export const setMessages: Mock = vi.fn();

/** Captures the `useChat` options the component passed (so a test can invoke `onFinish`). */
export const captured: { options?: { onFinish?: (e: unknown) => void } } = {};

/**
 * Mutable settings stub the `useSettingsStore` mock selects over. Mutable so a single test can flip
 * `focusOnCompletion` to 'move' (etc.) without re-mocking the module; reset in the shared afterEach.
 */
export const mockSettings = {
  announcementPeriodMs: 2000,
  readWholeOnComplete: false,
  focusOnCompletion: 'keep' as 'keep' | 'move',
  sendKeyMode: 'modEnter' as 'modEnter' | 'enter',
  userName: 'You',
  assistantName: 'Assistant',
  /** The active model id; mirrors the real settings field used by useConversationReasoning. */
  selectedModelId: '',
};

/** Mutable readiness the `useChatReadiness` mock returns; reset in the shared afterEach. */
export const readiness = {
  value: 'ready' as 'loading' | 'unconfigured' | 'model-unavailable' | 'ready',
};

/**
 * Build the default two-message conversation (one user, one assistant) as a FRESH array of fresh
 * objects each call. A factory, not a shared literal, because a sibling (`ConversationView.streaming`)
 * mutates `state.messages` in place (it rewrites the assistant message's id); resetting to a fresh
 * copy in the shared afterEach keeps tests order-independent (finding L-p).
 */
export function defaultMessages() {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
  ];
}

/**
 * Mutable chat state shared across all ConversationView siblings (the `useChat` mock returns it).
 * Tests mutate fields directly (e.g. `state.status = 'streaming'`) in-test; reset in the afterEach.
 */
export const state = {
  messages: defaultMessages(),
  sendMessage,
  setMessages,
  stop,
  regenerate,
  status: 'ready' as 'ready' | 'submitted' | 'streaming' | 'error',
  error: undefined as Error | undefined,
};

/**
 * Mutable event bus for capturing notification events in tests.
 * Siblings register a channel in beforeEach and clear this array there too.
 */
export const events: NotificationEvent[] = [];

/**
 * Wrap `ui` in the providers `ConversationView` needs: a `HotkeysProvider` (chat hotkeys via
 * `useHotkeysContext()`) and a fresh, retry-off `QueryClientProvider` (`useQueryClient` and the
 * `useConversationList` read inside `useChatConflict`/`useBaseRevision`). A fresh client per call keeps
 * cases isolated; retries off means an absent/stubbed list fetch settles immediately, so the derived
 * `baseRevision` stays `undefined` - suitable for these UI-focused cases. Use this for any direct
 * `render`/`rerender`/`renderWithRouter` call so the providers are always present.
 *
 * @param ui - The element under test.
 * @returns The element wrapped in the required providers.
 */
export function withChatProviders(ui: ReactElement): ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider initiallyActiveScopes={['*']}>{ui}</HotkeysProvider>
    </QueryClientProvider>
  );
}

/** Render `ui` wrapped in the chat providers (see {@link withChatProviders}). */
export function renderView(ui: ReactElement): RenderResult {
  return render(withChatProviders(ui));
}

/** Register the shared notification-capture and state-reset lifecycle hooks. */
export function registerConversationViewHooks(): void {
  beforeEach(() => {
    events.length = 0;
    registerChannel((e) => events.push(e));
    // Clear the spies here (not only in afterEach): unmounting a still-streaming view triggers
    // `useAbortOnLeave`'s abort during the global `cleanup()` afterEach, which runs AFTER this
    // suite's afterEach - so a leftover `stop()` call would otherwise leak into the next test.
    sendMessage.mockClear();
    setMessages.mockClear();
    stop.mockClear();
    regenerate.mockClear();
    vi.mocked(reportClientError).mockClear();
  });

  afterEach(() => {
    resetChannels();
    state.messages = defaultMessages();
    state.error = undefined;
    state.status = 'ready';
    mockSettings.focusOnCompletion = 'keep';
    mockSettings.userName = 'You';
    mockSettings.assistantName = 'Assistant';
    mockSettings.selectedModelId = '';
    readiness.value = 'ready';
  });
}
