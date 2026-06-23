import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { describe, expect, it, vi } from 'vitest';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';

import {
  events,
  expectFocus,
  Harness,
  registerHotkeyHooks,
  renderHarness,
} from './useChatHotkeys.testkit';

registerHotkeyHooks();

describe('useChatHotkeys jumps and control shortcuts', () => {
  it('Alt+A focuses the latest assistant heading, even from the composer', async () => {
    renderHarness();
    await userEvent.click(screen.getByLabelText('Message'));
    expect(document.getElementById('composer')).toHaveFocus();
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await expectFocus('message-a1');
  });

  it('Alt+U focuses the latest user heading', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}u{/Alt}');
    await expectFocus('message-u1');
  });

  it('Alt+C focuses the composer', async () => {
    renderHarness();
    document.getElementById('message-a1')?.focus();
    await userEvent.keyboard('{Alt>}c{/Alt}');
    expect(document.getElementById('composer')).toHaveFocus();
  });

  it('Alt+C announces "already in composer" (no-op feedback) when it already has focus', async () => {
    renderHarness();
    document.getElementById('composer')?.focus();
    await userEvent.keyboard('{Alt>}c{/Alt}');
    // A plain re-focus would be silent; instead the action speaks so the keystroke is not inert.
    expect(events.some((e) => e.type === 'alreadyInComposer')).toBe(true);
    expect(document.getElementById('composer')).toHaveFocus();
  });

  it('Shift+Escape calls onStop', async () => {
    const onStop = vi.fn();
    renderHarness(onStop);
    await userEvent.keyboard('{Shift>}{Escape}{/Shift}');
    expect(onStop).toHaveBeenCalled();
  });

  it('Alt+Enter invokes the send-key-mode toggle handler with the bound key', async () => {
    const onToggleSendKeyMode = vi.fn();
    render(
      <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
        <Harness onStop={vi.fn()} onToggleSendKeyMode={onToggleSendKeyMode} />
      </HotkeysProvider>,
    );
    await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
    expect(onToggleSendKeyMode).toHaveBeenCalledTimes(1);
    expect(onToggleSendKeyMode).toHaveBeenCalledWith('alt+enter');
  });

  it('Alt+T calls the supplied onToggleThinking handler', async () => {
    const onToggleThinking = vi.fn();
    render(
      <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
        <Harness onStop={vi.fn()} onToggleThinking={onToggleThinking} />
      </HotkeysProvider>,
    );
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(onToggleThinking).toHaveBeenCalledTimes(1);
  });

  it('Alt+R calls the supplied onJumpToThinking handler', async () => {
    const onJumpToThinking = vi.fn();
    render(
      <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
        <Harness onStop={vi.fn()} onJumpToThinking={onJumpToThinking} />
      </HotkeysProvider>,
    );
    await userEvent.keyboard('{Alt>}r{/Alt}');
    expect(onJumpToThinking).toHaveBeenCalledTimes(1);
  });

  it('a jump fires repeatedly, not just the first time', async () => {
    renderHarness();
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await expectFocus('message-a1');
    document.getElementById('composer')?.focus(); // move focus away, then press again
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await expectFocus('message-a1');
  });

  it('re-pressing a jump re-fires focus even when the heading already has focus', async () => {
    renderHarness();
    let focusinCount = 0;
    document.getElementById('message-a1')?.addEventListener('focusin', () => (focusinCount += 1));
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await expectFocus('message-a1');
    await waitFor(() => expect(focusinCount).toBe(1));
    // Press again WITHOUT moving focus away. A plain `.focus()` on the already-focused heading is a
    // no-op that fires no event (NVDA's reading caret never returns); the blur-first fix must emit a
    // fresh focusin every press so the screen reader re-announces the heading.
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await waitFor(() => expect(focusinCount).toBe(2));
  });

  it('Alt+A focuses the latest assistant even when its id is blank', async () => {
    const blankIdMsgs = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
      { id: '', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
    ] as AnvikaUIMessage[];
    renderHarness(vi.fn(), 'descriptor', blankIdMsgs);
    await userEvent.keyboard('{Alt>}a{/Alt}');
    await expectFocus('message-pos-1');
    // The role jump found the message, so it must NOT speak the "no assistant response yet" notice.
    expect(events.some((e) => e.type === 'noMessageForRole')).toBe(false);
  });
});
