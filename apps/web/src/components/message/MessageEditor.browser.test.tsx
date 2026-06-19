import { HotkeysProvider } from 'react-hotkeys-hook';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import { MessageEditor } from './MessageEditor';

// Real Chromium exercises the element-scoped send hotkey, real key events (Enter / Ctrl+Enter /
// Shift+Enter), native textarea newline insertion, and focus-on-mount - behaviors jsdom cannot model
// (ADR 0013). The editor's send binding is `scopes: ['chat']`, so wrap in an active chat scope.
function renderEditor(ui: Parameters<typeof render>[0]) {
  return render(<HotkeysProvider initiallyActiveScopes={['*', 'chat']}>{ui}</HotkeysProvider>);
}

test('moves focus into the textarea on mount', async () => {
  await renderEditor(
    <MessageEditor
      initialText="Hello"
      sendKeyMode="modEnter"
      sendBinding={DEFAULT_KEYMAP.send}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toHaveFocus();
});

test('modEnter: Ctrl+Enter submits the edited text, plain Enter inserts a newline', async () => {
  const onSubmit = vi.fn();
  await renderEditor(
    <MessageEditor
      initialText="ab"
      sendKeyMode="modEnter"
      sendBinding={DEFAULT_KEYMAP.send}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  const textarea = page.getByRole('textbox', { name: 'Edit message' });
  await expect.element(textarea).toHaveFocus();
  // Plain Enter does NOT submit in modEnter mode (it is the newline key, not the send key).
  await userEvent.keyboard('{Enter}');
  expect(onSubmit).not.toHaveBeenCalled();
  // Ctrl+Enter submits the trimmed text.
  await userEvent.keyboard('{Control>}{Enter}{/Control}');
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ab'));
});

test('enter: plain Enter submits, Shift+Enter inserts a newline', async () => {
  const onSubmit = vi.fn();
  await renderEditor(
    <MessageEditor
      initialText="hi"
      sendKeyMode="enter"
      sendBinding={DEFAULT_KEYMAP.send}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  const textarea = page.getByRole('textbox', { name: 'Edit message' });
  await expect.element(textarea).toHaveFocus();
  // Shift+Enter does NOT submit in enter mode (it is the newline key, not the send key).
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  expect(onSubmit).not.toHaveBeenCalled();
  // Plain Enter submits the trimmed text.
  await userEvent.keyboard('{Enter}');
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('hi'));
});

test('Cancel abandons the edit (always escapable)', async () => {
  const onCancel = vi.fn();
  await renderEditor(
    <MessageEditor
      initialText="ab"
      sendKeyMode="modEnter"
      sendBinding={DEFAULT_KEYMAP.send}
      onSubmit={vi.fn()}
      onCancel={onCancel}
    />,
  );
  await expect.element(page.getByRole('textbox', { name: 'Edit message' })).toHaveFocus();
  // Cancel is never disabled: the user can always abandon an edit.
  await userEvent.click(page.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});
