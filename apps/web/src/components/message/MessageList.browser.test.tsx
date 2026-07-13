import { HotkeysProvider } from 'react-hotkeys-hook';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { afterEach, expect, test, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { MessageList } from './MessageList';

afterEach(() => {
  resetChannels();
});

/** The send-key config the inline editor needs (mirrors the jsdom edit tests). */
const EDIT_CONFIG = { sendKeyMode: 'modEnter', sendBinding: 'mod+enter' } as const;

/**
 * Render MessageList inside an active `chat` hotkey scope (the scope the Ctrl+Up edit-latest hotkey
 * lives in) plus a real textarea to focus, so the keyboard event originates from a form tag exactly
 * as the Composer would. A real browser is required: keyboard dispatch and focus-on-mount of the
 * editor are behaviors jsdom cannot model (ADR 0013).
 */
function renderList(ui: Parameters<typeof render>[0]) {
  return render(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <textarea aria-label="Composer probe" />
      {ui}
    </HotkeysProvider>,
  );
}

test('renders the Thinking region before the answer body for a reasoning message', async () => {
  const withReasoning: AnvikaUIMessage[] = [
    {
      id: 'a1',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'I think first.' },
        { type: 'text', text: 'Then I answer.' },
      ],
    } as AnvikaUIMessage,
  ];
  await render(<MessageList messages={withReasoning} busy={false} />);
  const headings = Array.from(document.querySelectorAll('h3')).filter((h) =>
    h.textContent?.includes('Thinking'),
  );
  expect(headings).toHaveLength(1);
  const [thinking] = headings;
  const answer = Array.from(document.querySelectorAll('p')).find(
    (p) => p.textContent === 'Then I answer.',
  );
  if (thinking === undefined || answer === undefined) throw new Error('region or answer missing');
  // The Thinking heading must come BEFORE the answer text in document order.
  expect(thinking.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('regenerating an assistant row calls the bundle regenerate with that message id', async () => {
  const regenerate = vi.fn();
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
    { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'Hello!' }] },
  ];
  await render(<MessageList messages={messages} busy={false} messageActions={{ regenerate }} />);
  // Open the assistant row's actions menu and activate Regenerate; it must pass the stable message id.
  await userEvent.click(page.getByRole('button', { name: "Actions for Assistant's message" }));
  await expect
    .element(page.getByRole('menuitem', { name: 'Regenerate response' }))
    .toBeInTheDocument();
  await userEvent.click(page.getByRole('menuitem', { name: 'Regenerate response' }));
  await vi.waitFor(() => expect(regenerate).toHaveBeenCalledWith('a2'));
});

test('Ctrl+Up opens the editor for the most recent user message and moves focus into it', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'first question' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'an answer' }] },
    { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'latest question' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit: vi.fn() }}
      editConfig={EDIT_CONFIG}
    />,
  );
  // Focus a chat-scoped form tag (the Composer stand-in), then press Ctrl+Up.
  const probe = page.getByRole('textbox', { name: 'Composer probe' });
  probe.element().focus();
  await userEvent.keyboard('{Control>}{ArrowUp}{/Control}');
  // The editor for the LATEST user message (u2) opens, prefilled with its text, and takes focus.
  const editor = page.getByRole('textbox', { name: 'Edit message' });
  await expect.element(editor).toHaveValue('latest question');
  await expect.element(editor).toHaveFocus();
  // A content-safe "editing last message" announcement fires so the SR user knows which message it is.
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'latestMessageEditStarted')).toBe(true),
  );
});

test('Ctrl+Up while busy refuses the edit, fires editUnavailableWhileGenerating, and opens no editor', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'a question' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  await renderList(
    <MessageList
      messages={messages}
      busy={true}
      messageActions={{ edit: vi.fn() }}
      editConfig={EDIT_CONFIG}
    />,
  );
  const probe = page.getByRole('textbox', { name: 'Composer probe' });
  probe.element().focus();
  await userEvent.keyboard('{Control>}{ArrowUp}{/Control}');
  // The guard refuses mid-stream: no editor opens, the probe keeps focus, and the spoken notice fires
  // (so the editor never clobbers the live response). The last-message edit-start must NOT fire.
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'editUnavailableWhileGenerating')).toBe(true),
  );
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
  await expect.element(probe).toHaveFocus();
  expect(events.some((e) => e.type === 'latestMessageEditStarted')).toBe(false);
});

test('Ctrl+Up is a no-op when there is no user message', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'assistant only' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit: vi.fn() }}
      editConfig={EDIT_CONFIG}
    />,
  );
  const probe = page.getByRole('textbox', { name: 'Composer probe' });
  probe.element().focus();
  await userEvent.keyboard('{Control>}{ArrowUp}{/Control}');
  // No editor appears; the focus stays on the probe (never stranded).
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
  await expect.element(probe).toHaveFocus();
  // No message was found to edit, so no edit-start announcement fires (the no-op path stays silent).
  expect(events.some((e) => e.type === 'latestMessageEditStarted')).toBe(false);
});

test('activating the menu Edit item announces a generic edit-started (not the last-message variant)', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit: vi.fn() }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
  // The menu-open path announces the generic edit-started, NEVER the Ctrl+Up last-message variant.
  await vi.waitFor(() => expect(events.some((e) => e.type === 'messageEditStarted')).toBe(true));
  expect(events.some((e) => e.type === 'latestMessageEditStarted')).toBe(false);
});

test('cancelling the editor announces messageEditCancelled and not messageEdited', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit: vi.fn() }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(events.some((e) => e.type === 'messageEditCancelled')).toBe(true));
  // The cancel path is distinct from the submit path: it never announces the edited/generating event.
  expect(events.some((e) => e.type === 'messageEdited')).toBe(false);
});

test('submitting the open editor while busy refuses via Save, announces, and keeps it open', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  const edit = vi.fn();
  // Open the editor while idle, then flip busy on a rerender so the live row begins streaming.
  const { rerender } = await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
  await rerender(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <textarea aria-label="Composer probe" />
      <MessageList
        messages={messages}
        busy={true}
        messageActions={{ edit }}
        editConfig={EDIT_CONFIG}
      />
    </HotkeysProvider>,
  );
  // A blocked submit must SPEAK the reason (a disabled control would be silent). Save does not resend,
  // the spoken notice fires, and the editor stays OPEN so the user can wait for streaming or cancel.
  await userEvent.click(page.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'editUnavailableWhileGenerating')).toBe(true),
  );
  expect(edit).not.toHaveBeenCalled();
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
});

test('submitting the open editor while busy refuses via the send key, announces, and keeps it open', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  const edit = vi.fn();
  const { rerender } = await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  const editor = page.getByRole('textbox', { name: 'Edit message' });
  await expect.element(editor).toBeInTheDocument();
  await rerender(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <textarea aria-label="Composer probe" />
      <MessageList
        messages={messages}
        busy={true}
        messageActions={{ edit }}
        editConfig={EDIT_CONFIG}
      />
    </HotkeysProvider>,
  );
  // The send accelerator (Ctrl+Enter in modEnter) reaches the same MessageList submit chokepoint, so it
  // too is gated: the notice fires, edit is not called, and the editor stays open.
  editor.element().focus();
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'editUnavailableWhileGenerating')).toBe(true),
  );
  expect(edit).not.toHaveBeenCalled();
  await expect.element(editor).toBeInTheDocument();
});

test('cancelling the open editor while busy abandons the edit (always escapable)', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  const edit = vi.fn();
  const { rerender } = await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
  await rerender(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <textarea aria-label="Composer probe" />
      <MessageList
        messages={messages}
        busy={true}
        messageActions={{ edit }}
        editConfig={EDIT_CONFIG}
      />
    </HotkeysProvider>,
  );
  // Cancel is never gated: the user can always abandon an edit, even mid-stream. The editor closes.
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(events.some((e) => e.type === 'messageEditCancelled')).toBe(true));
  expect(edit).not.toHaveBeenCalled();
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).not.toBeInTheDocument();
});

test('submitting the editor does NOT announce messageEditCancelled (only the cancel path does)', async () => {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  const events: NotificationEvent[] = [];
  registerChannel((e) => events.push(e));
  const edit = vi.fn();
  await renderList(
    <MessageList
      messages={messages}
      busy={false}
      messageActions={{ edit }}
      editConfig={EDIT_CONFIG}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toBeInTheDocument();
  await userEvent.click(page.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(edit).toHaveBeenCalledWith('u1', 'Hi there'));
  // The shared closeEditor must not announce cancel; only the cancel-specific handler does. (The
  // edited/generating announcement comes from messageActions.edit, which is mocked here.)
  expect(events.some((e) => e.type === 'messageEditCancelled')).toBe(false);
});
