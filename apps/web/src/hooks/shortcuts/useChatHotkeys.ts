import { type RefObject, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

import { type KeymapAction } from '@anvika/shared/settings/keymap';
import { QUICK_NAV_ACTIONS } from '@anvika/shared/settings/keymap-quick-nav';

import { logDiag } from '../../diagnostics/logDiag';
import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import type { RoleLabels } from '../../lib/format/displayNames';
import { describeMessage, readFullMessage } from '../../lib/message/messageDescriptor';
import {
  handleQuickNavPress,
  handleRoleJump,
  type LastPressRef,
} from '../../lib/keyboard/quickNav';
import type { TimestampFormatOptions } from '../../lib/format/timestampOptions';
import { notify } from '../../notifications/notifier';

/** Tags the chat shortcuts still fire on, so they work while the composer textarea has focus. */
const FORM_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'] as const;

/** What {@link useChatHotkeys} needs from the chat surface. */
export interface ChatHotkeysOptions {
  /** The resolved keymap (defaults merged with overrides). */
  keymap: Record<KeymapAction, string>;
  /** The conversation messages (for the latest-by-role jumps and quick-nav slots). */
  messages: AnvikaUIMessage[];
  /** Stop the in-flight generation. */
  onStop: () => void;
  /** Toggle the send key mode (bound to the keymap `toggleSendKeyMode` action). Receives the bound
   *  keystroke so the hook can record it in the `sendKeyModeToggled` diagnostic. */
  onToggleSendKeyMode: (key: string) => void;
  /** Toggle thinking on/off for this conversation (bound to `toggleThinking`). */
  onToggleThinking: () => void;
  /** Focus the latest message's Thinking region, or announce a no-op (bound to `jumpToThinking`). */
  onJumpToThinking: () => void;
  /** Ref to the composer textarea, the jump-to-composer target. */
  composerRef: RefObject<HTMLTextAreaElement | null>;
  /** Whether a quick-nav single press reads the descriptor or the full message text. */
  quickNavReads: 'descriptor' | 'full';
  /** The window, in milliseconds, in which a second press on the same slot focuses the message. */
  quickNavDoublePressMs: number;
  /** Where the descriptor's truncation length cue is spoken. */
  quickNavLengthCue: 'count-first' | 'count-after';
  /** How many words the descriptor previews before truncating. */
  quickNavPreviewWords: number;
  /** The resolved display labels spoken in quick-nav single-press reads. */
  displayNames: RoleLabels;
  /** How an absolute fallback time renders in the spoken descriptor (from settings). */
  timestampOptions: TimestampFormatOptions;
}

/**
 * Jump focus to the composer, or speak a no-op notice when it already holds focus (a plain re-focus
 * would be a silent no-op, so the keystroke would otherwise give a screen-reader user no feedback).
 *
 * @param composerRef - Ref to the composer textarea.
 */
function jumpToComposer(composerRef: RefObject<HTMLTextAreaElement | null>): void {
  const el = composerRef.current;
  if (!el) return;
  if (document.activeElement === el) notify({ type: 'alreadyInComposer' });
  else el.focus();
}

/**
 * Bind the chat shortcuts (`chat` scope): Stop, the three jumps, and quick-nav (Alt+1..Alt+0),
 * firing even while the composer has focus. All bindings come from the resolved keymap
 * (rebindable). The quick-nav press and role jumps are handled by `quickNav.ts`, which also emits the
 * content-safe keyboard diagnostics (`quickNavKeypress`/`quickNavResolved`/`roleJumpResolved`); the
 * stop binding emits `stopRequested`. Observable behavior (focus moves, spoken no-op notices, the
 * single-press read) is unchanged.
 *
 * @param options - The keymap, messages, stop handler, composer ref, and quick-nav settings.
 */
export function useChatHotkeys({
  keymap,
  messages,
  onStop,
  onToggleSendKeyMode,
  onToggleThinking,
  onJumpToThinking,
  composerRef,
  quickNavReads,
  quickNavDoublePressMs,
  quickNavLengthCue,
  quickNavPreviewWords,
  displayNames,
  timestampOptions,
}: ChatHotkeysOptions): void {
  const opts = { scopes: ['chat'], preventDefault: true, enableOnFormTags: FORM_TAGS };
  useHotkeys(
    keymap.stop,
    () => {
      logDiag({ type: 'stopRequested', key: keymap.stop });
      onStop();
    },
    opts,
    [onStop, keymap.stop],
  );
  useHotkeys(
    keymap.jumpToLatestResponse,
    () => handleRoleJump({ key: keymap.jumpToLatestResponse, role: 'assistant', messages }),
    opts,
    [messages, keymap.jumpToLatestResponse],
  );
  useHotkeys(
    keymap.jumpToLatestUser,
    () => handleRoleJump({ key: keymap.jumpToLatestUser, role: 'user', messages }),
    opts,
    [messages, keymap.jumpToLatestUser],
  );
  useHotkeys(keymap.jumpToComposer, () => jumpToComposer(composerRef), opts, []);
  useHotkeys(keymap.toggleSendKeyMode, () => onToggleSendKeyMode(keymap.toggleSendKeyMode), opts, [
    onToggleSendKeyMode,
    keymap.toggleSendKeyMode,
  ]);
  useHotkeys(keymap.toggleThinking, onToggleThinking, opts, [
    onToggleThinking,
    keymap.toggleThinking,
  ]);
  useHotkeys(keymap.jumpToThinking, onJumpToThinking, opts, [
    onJumpToThinking,
    keymap.jumpToThinking,
  ]);

  // Quick-nav: one binding per slot. The shared `lastPress` ref tracks the last slot+time so a second
  // press on the same slot within the window focuses (rather than re-reads) the message.
  const lastPress = useRef<LastPressRef['current']>(null);
  QUICK_NAV_ACTIONS.forEach((action, index) => {
    const slot = index + 1;
    useHotkeys(
      keymap[action],
      () =>
        handleQuickNavPress({
          key: keymap[action],
          slot,
          messages,
          lastPress,
          now: Date.now(),
          doublePressMs: quickNavDoublePressMs,
          read: (target, now) =>
            quickNavReads === 'full'
              ? readFullMessage(target, now, displayNames, timestampOptions)
              : describeMessage(
                  target,
                  now,
                  {
                    lengthCue: quickNavLengthCue,
                    previewWords: quickNavPreviewWords,
                  },
                  displayNames,
                  timestampOptions,
                ),
        }),
      opts,
      [
        messages,
        quickNavReads,
        quickNavDoublePressMs,
        quickNavLengthCue,
        quickNavPreviewWords,
        // Depend on the four primitive fields, not the `timestampOptions` object: the parent may
        // rebuild the object every render; the primitives only change when the values actually change.
        timestampOptions.weekday,
        timestampOptions.dateStyle,
        timestampOptions.hourCycle,
        timestampOptions.seconds,
        // Depend on the resolved name strings, not the `displayNames` object: the parent rebuilds
        // that object every render, so depending on it would re-register all 10 hotkeys on every
        // render (e.g. each heartbeat tick). The strings only change when the names actually change.
        displayNames.user,
        displayNames.assistant,
        keymap[action],
      ],
    );
  });
}
