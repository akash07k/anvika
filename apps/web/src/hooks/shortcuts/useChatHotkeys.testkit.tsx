import { render, waitFor, type RenderResult } from '@testing-library/react';
import { useRef } from 'react';
import { HotkeysProvider } from 'react-hotkeys-hook';
import { afterEach, beforeEach, expect, vi } from 'vitest';

import { DEFAULT_KEYMAP } from '@anvika/shared/settings/keymap';

import { messageDomId, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { DEFAULT_TIMESTAMP_OPTIONS } from '../../lib/format/timestampOptions';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';
import { useChatHotkeys } from './useChatHotkeys';

/** The default two-message fixture (one user, one assistant) bound by the harness. */
export const messages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] },
  { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'hello' }] },
] as AnvikaUIMessage[];

/** Props for the test {@link Harness}: the stop handler, quick-nav read mode, and messages to bind. */
export interface HarnessProps {
  onStop: () => void;
  quickNavReads?: 'descriptor' | 'full';
  msgs?: AnvikaUIMessage[];
  onToggleSendKeyMode?: (key: string) => void;
  onToggleThinking?: () => void;
  onJumpToThinking?: () => void;
  displayNames?: { user: string; assistant: string };
}

/** A minimal host that mounts {@link useChatHotkeys} over message headings and a composer textarea. */
export function Harness({
  onStop,
  quickNavReads = 'descriptor',
  msgs = messages,
  onToggleSendKeyMode = vi.fn(),
  onToggleThinking = vi.fn(),
  onJumpToThinking = vi.fn(),
  displayNames = { user: 'You', assistant: 'Assistant' },
}: HarnessProps) {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useChatHotkeys({
    keymap: DEFAULT_KEYMAP,
    messages: msgs,
    onStop,
    composerRef,
    onToggleSendKeyMode,
    onToggleThinking,
    onJumpToThinking,
    quickNavReads,
    quickNavDoublePressMs: 500,
    quickNavLengthCue: 'count-first',
    quickNavPreviewWords: 40,
    displayNames,
    timestampOptions: DEFAULT_TIMESTAMP_OPTIONS,
  });
  return (
    <div>
      {msgs.map((message, index) => (
        <h2
          key={messageDomId(message, index)}
          id={`message-${messageDomId(message, index)}`}
          tabIndex={-1}
        >
          {message.role === 'assistant' ? 'Assistant' : 'You'}
        </h2>
      ))}
      <textarea id="composer" ref={composerRef} aria-label="Message" />
    </div>
  );
}

/** Render the {@link Harness} under an active HotkeysProvider (the `*` and `chat` scopes). */
export function renderHarness(
  onStop: () => void = vi.fn(),
  quickNavReads: 'descriptor' | 'full' = 'descriptor',
  msgs: AnvikaUIMessage[] = messages,
): RenderResult {
  return render(
    <HotkeysProvider initiallyActiveScopes={['*', 'chat']}>
      <Harness onStop={onStop} quickNavReads={quickNavReads} msgs={msgs} />
    </HotkeysProvider>,
  );
}

/** Wait for the deferred (setTimeout) heading focus to land on the element with the given id. */
export async function expectFocus(id: string): Promise<void> {
  await waitFor(() => expect(document.getElementById(id)).toHaveFocus());
}

/** The notification events captured during a test; reset by {@link registerHotkeyHooks}. */
export const events: NotificationEvent[] = [];

/** Register the shared notification-capture and channel-reset lifecycle hooks. */
export function registerHotkeyHooks(): void {
  beforeEach(() => {
    events.length = 0;
    registerChannel((e) => events.push(e));
  });
  afterEach(() => {
    resetChannels();
  });
}
