import { logDiag } from '../../diagnostics/logDiag';
import { notify } from '../../notifications/notifier';
import { messageDomId, type AnvikaUIMessage } from '../message/anvikaMessage';
import { focusMessage, isMessageFocused } from '../message/messageFocus';

/** Mutable holder for the last quick-nav press, shared across slots to detect a double press. */
export type LastPressRef = { current: { slot: number; at: number } | null };

/** Arguments for {@link handleQuickNavPress}. */
export interface QuickNavPressArgs {
  /** The bound keystroke (e.g. `alt+1`), for the diagnostic. */
  key: string;
  /** The slot pressed (1 = most recent). */
  slot: number;
  /** The conversation messages, newest last. */
  messages: AnvikaUIMessage[];
  /** The shared last-press ref. */
  lastPress: LastPressRef;
  /** Current time (epoch ms); injectable for tests. */
  now: number;
  /** The double-press window in milliseconds. */
  doublePressMs: number;
  /** Produce the spoken text for a single-press read of the target message. */
  read: (target: AnvikaUIMessage, now: number) => string;
}

/** The latest index of `role`, or -1 when none. */
function lastIndexByRole(messages: AnvikaUIMessage[], role: 'user' | 'assistant'): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === role) return i;
  }
  return -1;
}

/**
 * Handle one quick-nav slot press: emit the per-keystroke trace, resolve the target, and either
 * focus it (a same-slot double press within the window), read it (single press), or notify that the
 * slot is empty. Always emits a `quickNavResolved` diagnostic with the resolved target (or
 * `found: false`), so the outcome is visible in the log even when nothing happens.
 *
 * A same-slot double press onto the already-focused message speaks an "already focused" notice and
 * logs `alreadyFocused: true` instead of re-focusing (so a screen-reader user always gets spoken
 * feedback that the keypress registered).
 *
 * @param args - The press context (see {@link QuickNavPressArgs}).
 */
export function handleQuickNavPress(args: QuickNavPressArgs): void {
  const { key, slot, messages, lastPress, now, doublePressMs, read } = args;
  const prev = lastPress.current;
  const isDouble = prev !== null && prev.slot === slot && now - prev.at <= doublePressMs;
  const press: 'single' | 'double' = isDouble ? 'double' : 'single';
  const sinceLastMs = prev !== null && prev.slot === slot ? now - prev.at : undefined;
  logDiag({
    type: 'quickNavKeypress',
    key,
    slot,
    press,
    ...(sinceLastMs !== undefined ? { sinceLastMs } : {}),
  });

  const targetIndex = messages.length - slot;
  const target = messages[targetIndex];
  if (!target) {
    notify({ type: 'quickNavEmpty' });
    logDiag({ type: 'quickNavResolved', key, slot, press, found: false, total: messages.length });
    return;
  }

  const domId = messageDomId(target, targetIndex);
  const resolved = {
    type: 'quickNavResolved' as const,
    key,
    slot,
    press,
    found: true,
    total: messages.length,
    messageId: domId,
    role: target.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    index: targetIndex,
  };

  if (isDouble) {
    if (isMessageFocused(domId)) {
      // Re-targeting the message that already has focus: speak "already here" rather than a silent
      // re-focus, and record it on the diagnostic. Do NOT re-focus (no event to compete with speech).
      notify({ type: 'quickNavAlreadyFocused' });
      lastPress.current = null;
      logDiag({ ...resolved, alreadyFocused: true });
      return;
    }
    focusMessage(domId);
    lastPress.current = null;
    logDiag(resolved);
    return;
  }
  lastPress.current = { slot, at: now };
  logDiag(resolved);
  notify({ type: 'quickNavRead', text: read(target, now) });
}

/** Arguments for {@link handleRoleJump}. */
export interface RoleJumpArgs {
  /** The bound keystroke (e.g. `alt+a`). */
  key: string;
  /** The role to jump to. */
  role: 'user' | 'assistant';
  /** The conversation messages, newest last. */
  messages: AnvikaUIMessage[];
}

/**
 * Jump focus to the latest message of `role`, or speak a no-op notice when there is none. Always
 * emits a `roleJumpResolved` diagnostic carrying the resolved target or `found: false`.
 *
 * @param args - The jump context (see {@link RoleJumpArgs}).
 */
export function handleRoleJump(args: RoleJumpArgs): void {
  const { key, role, messages } = args;
  const index = lastIndexByRole(messages, role);
  const target = index >= 0 ? messages[index] : undefined;
  if (target) {
    const domId = messageDomId(target, index);
    focusMessage(domId);
    logDiag({ type: 'roleJumpResolved', key, role, found: true, messageId: domId, index });
    return;
  }
  notify({ type: 'noMessageForRole', role });
  logDiag({ type: 'roleJumpResolved', key, role, found: false });
}
