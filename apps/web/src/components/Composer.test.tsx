import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';
import { Composer } from './Composer';
import type { NotificationEvent } from '../notifications/events';
import { registerChannel, resetChannels } from '../notifications/notifier';

// The send hotkey lives in `scopes: ['chat']` (mirroring real usage, where ConversationView enables
// the chat scope under the app's HotkeysProvider). Wrap the renders so the chat scope is active here.
function renderComposer(ui: Parameters<typeof render>[0]) {
  return render(<HotkeysProvider initiallyActiveScopes={['*', 'chat']}>{ui}</HotkeysProvider>);
}

const events: NotificationEvent[] = [];
beforeEach(() => {
  events.length = 0;
  registerChannel((e) => events.push(e));
});
afterEach(() => {
  resetChannels();
});

describe('Composer send-key modes', () => {
  it('modEnter: Ctrl+Enter sends, plain Enter newlines', async () => {
    const onSend = vi.fn();
    renderComposer(
      <Composer
        disabled={false}
        onSend={onSend}
        sendKeyMode="modEnter"
        sendBinding={DEFAULT_KEYMAP.send}
      />,
    );
    await userEvent.type(screen.getByLabelText('Message'), 'hello');
    await userEvent.keyboard('{Enter}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSend).toHaveBeenCalledWith('hello');
  });

  it('enter: plain Enter sends, Shift+Enter newlines', async () => {
    const onSend = vi.fn();
    renderComposer(
      <Composer
        disabled={false}
        onSend={onSend}
        sendKeyMode="enter"
        sendBinding={DEFAULT_KEYMAP.send}
      />,
    );
    await userEvent.type(screen.getByLabelText('Message'), 'hi');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('sending an empty message speaks a no-op notice and does not call onSend', async () => {
    const onSend = vi.fn();
    renderComposer(
      <Composer
        disabled={false}
        onSend={onSend}
        sendKeyMode="enter"
        sendBinding={DEFAULT_KEYMAP.send}
      />,
    );
    await userEvent.click(screen.getByLabelText('Message'));
    await userEvent.keyboard('{Enter}'); // empty field
    expect(onSend).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'composerEmpty')).toBe(true);
  });
});
