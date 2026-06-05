import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import type { ReactElement } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

/**
 * Real-component focus regression guard: renders the REAL {@link ConversationView} (with the real
 * {@link MessageList} and {@link useChatHotkeys} in the tree) in real Chromium, presses Alt+A
 * (`jumpToLatestResponse`), and asserts DOM focus lands on the latest assistant heading (`message-a1`)
 * AND stays there (no revert from a re-render or a focus-stealing effect). A focusin/focusout log
 * makes a move-then-revert visible. This guards the DOM layer only; whether a screen reader follows
 * the focus is an SR-technique concern this test cannot observe.
 *
 * Mocks mirror `ConversationView.test.tsx` so the component renders with two messages and `settings`,
 * with no real `useChat`/server.
 */
const { state, mockSettings } = vi.hoisted(() => {
  const settingsStub = {
    userName: 'You',
    assistantName: 'Assistant',
    announcementPeriodMs: 2000,
    readWholeOnComplete: false,
    focusOnCompletion: 'keep' as 'keep' | 'move',
    sendKeyMode: 'modEnter' as 'modEnter' | 'enter',
  };
  return {
    mockSettings: settingsStub,
    state: {
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
      ],
      sendMessage: vi.fn(),
      stop: vi.fn(),
      regenerate: vi.fn(),
      status: 'ready' as 'ready' | 'submitted' | 'streaming' | 'error',
      error: undefined as Error | undefined,
    },
  };
});

vi.mock('@ai-sdk/react', () => ({
  useChat: () => state,
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ status: 'ready', settings: mockSettings, hydrate: vi.fn() }),
}));

vi.mock('../hooks/chat/useChatReadiness', () => ({
  useChatReadiness: () => 'ready',
}));

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

vi.mock('../hooks/conversation/useConversationReasoning', () => ({
  useConversationReasoning: () => ({
    override: 'inherit',
    capable: false,
    onEffortChange: vi.fn(),
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
  }),
}));

const { ConversationView } = await import('./ConversationView');

function renderView(ui: ReactElement) {
  // A retry-off client so the `useConversationList` read inside `useChatConflict` settles at once.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <HotkeysProvider initiallyActiveScopes={['*']}>{ui}</HotkeysProvider>
    </QueryClientProvider>,
  );
}

/** Records the id (or tag) of every element that gains/loses focus, in order, to expose a revert. */
const focusLog: string[] = [];
function describeEl(el: EventTarget | null): string {
  const node = el as HTMLElement | null;
  if (!node) return 'null';
  return node.id ? `#${node.id}` : `<${node.tagName?.toLowerCase()}>`;
}
const onFocusIn = (e: FocusEvent) => focusLog.push(`in:${describeEl(e.target)}`);
const onFocusOut = (e: FocusEvent) =>
  focusLog.push(`out:${describeEl(e.target)}->${describeEl(e.relatedTarget)}`);

beforeEach(() => {
  focusLog.length = 0;
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
});

afterEach(() => {
  document.removeEventListener('focusin', onFocusIn, true);
  document.removeEventListener('focusout', onFocusOut, true);
});

test('Alt+A moves DOM focus to the latest assistant heading and it stays there', async () => {
  await renderView(<ConversationView />);

  const heading = document.getElementById('message-a1');
  expect(heading, 'message-a1 heading must exist in the real tree').not.toBeNull();
  expect(heading?.tabIndex, 'heading must be programmatically focusable').toBe(-1);

  await userEvent.keyboard('{Alt>}a{/Alt}');
  // Focus is deferred (~50ms) out of the keydown handler, so wait for it to land.
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(
    document.activeElement?.id,
    `focus after the deferred move (focusLog=${JSON.stringify(focusLog)})`,
  ).toBe('message-a1');

  // Wait more to catch a focus that moves then reverts via a later re-render or effect.
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(
    document.activeElement?.id,
    `focus after a further 250ms (focusLog=${JSON.stringify(focusLog)})`,
  ).toBe('message-a1');
});

test('Alt+A re-fires focus on the second press even when the heading already has focus', async () => {
  await renderView(<ConversationView />);

  const landings = () => focusLog.filter((e) => e === 'in:#message-a1').length;

  await userEvent.keyboard('{Alt>}a{/Alt}');
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(document.activeElement?.id, 'first press lands on message-a1').toBe('message-a1');
  expect(landings(), 'first press fires one focusin on message-a1').toBe(1);

  // Press again WITHOUT moving focus away. The browser fires no event for a no-op `.focus()` on the
  // already-focused element, so a screen reader's reading caret would never return - the regression
  // this guards. The blur-first fix must emit a fresh focusin on every press.
  await userEvent.keyboard('{Alt>}a{/Alt}');
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(document.activeElement?.id, 'second press keeps focus on message-a1').toBe('message-a1');
  expect(
    landings(),
    `second press must re-fire focusin (focusLog=${JSON.stringify(focusLog)})`,
  ).toBe(2);
});
