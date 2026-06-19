import { fireEvent, render, screen } from '@testing-library/react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import { MessageEditor } from './MessageEditor';

// The editor's send hotkey lives in `scopes: ['chat']` (mirroring real usage under the app's
// HotkeysProvider). Wrap renders so the chat scope is active, as Composer.test.tsx does.
function renderEditor(ui: Parameters<typeof render>[0]) {
  return render(<HotkeysProvider initiallyActiveScopes={['*', 'chat']}>{ui}</HotkeysProvider>);
}

describe('MessageEditor', () => {
  it('renders a labeled textbox prefilled with the initial text', () => {
    renderEditor(
      <MessageEditor
        initialText="Original message"
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Edit message' })).toHaveValue('Original message');
  });

  it('submits the trimmed text on form submit and the Save button', () => {
    const onSubmit = vi.fn();
    renderEditor(
      <MessageEditor
        initialText="Old"
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(textarea, { target: { value: '  Edited text  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith('Edited text');
  });

  it('disables Save and does not submit empty or whitespace-only text', () => {
    const onSubmit = vi.fn();
    renderEditor(
      <MessageEditor
        initialText="Old"
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(textarea, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(textarea);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels on Escape and on the Cancel button', () => {
    const onCancel = vi.fn();
    renderEditor(
      <MessageEditor
        initialText="Old"
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Edit message' });
    // Focus the textarea first: the editor's element-scoped send hotkey listens on the textarea node,
    // and react-hotkeys-hook swallows (stopImmediatePropagation) keydown events when the scoped element
    // is NOT the active element. In real use the editor is focused-on-mount, so Escape reaches the
    // component's onKeyDown; reproduce that here by focusing before dispatching.
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
