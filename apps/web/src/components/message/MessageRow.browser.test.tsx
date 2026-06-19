import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { expect, test, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { MessageList } from './MessageList';
import type { MessageEditConfig } from './messageEditConfig';

const editConfig: MessageEditConfig = { sendKeyMode: 'modEnter', sendBinding: 'mod+enter' };

/** Open the user row's actions menu and activate Edit, returning once the editor textarea is present. */
async function openEditor(): Promise<HTMLTextAreaElement> {
  await userEvent.click(page.getByRole('button', { name: 'Actions for your message' }));
  await userEvent.click(page.getByRole('menuitem', { name: 'Edit message' }));
  const editor = await vi.waitUntil(() =>
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Edit message"]'),
  );
  return editor;
}

async function renderList(messageActions: {
  edit: (id: string, text: string) => void;
}): Promise<void> {
  const messages: AnvikaUIMessage[] = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
  ];
  await render(
    <HotkeysProvider initiallyActiveScopes={['chat']}>
      <MessageList
        messages={messages}
        busy={false}
        messageActions={messageActions}
        editConfig={editConfig}
      />
    </HotkeysProvider>,
  );
}

test('opening Edit moves focus into the editor textarea', async () => {
  await renderList({ edit: vi.fn() });
  const editor = await openEditor();
  await vi.waitFor(() => expect(document.activeElement).toBe(editor));
});

test('submitting the editor returns focus to the message heading, never <body>', async () => {
  const edit = vi.fn();
  await renderList({ edit });
  await openEditor();
  await userEvent.click(page.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(edit).toHaveBeenCalledWith('u1', 'Hi there'));
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('message-u1'));
  expect(document.activeElement).not.toBe(document.body);
});

test('cancelling the editor returns focus to the message heading, never <body>', async () => {
  const edit = vi.fn();
  await renderList({ edit });
  await openEditor();
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(document.activeElement?.id).toBe('message-u1'));
  expect(edit).not.toHaveBeenCalled();
  expect(document.activeElement).not.toBe(document.body);
});
