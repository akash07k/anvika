import { useCallback, type RefObject } from 'react';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { textOf } from '../../lib/message/messageText';
import { notify } from '../../notifications/notifier';

/** Inputs for {@link useChatFinishHandler}. */
export interface ChatFinishHandlerInput {
  /** Whether the completed response body should be read in full (independent of focus mode). */
  readWhole: boolean;
  /** Focus-on-completion mode; `move` arms the pending focus flag. */
  focusMode: 'keep' | 'move';
  /** Set true so the focus-on-completion effect moves focus to the latest response heading. */
  pendingFocusOnComplete: RefObject<boolean>;
  /** Refreshes the conversation revision after a turn so the next send is not stale. */
  onTurnFinished: () => void;
}

/** The terminal-event payload `useChat` passes to `onFinish` (the fields this handler reads). */
export interface ChatFinishEvent {
  /** The turn was aborted (Stop) rather than completing or erroring. */
  isAbort: boolean;
  /** The turn ended in an error (the conflict hook is the single source for error speech). */
  isError: boolean;
  /** The completed assistant message. */
  message: AnvikaUIMessage;
}

/**
 * Build the `useChat` `onFinish` callback: on abort it announces the stop; on error it defers to the
 * conflict hook (no speech here); on success it announces completion, refreshes the revision so the
 * next send is not stale, and arms focus-on-completion when the mode is `move`.
 *
 * @param input - The completion settings and the post-finish revision refresh.
 * @returns A stable `onFinish` handler for `useChat`.
 */
export function useChatFinishHandler(
  input: ChatFinishHandlerInput,
): (event: ChatFinishEvent) => void {
  const { readWhole, focusMode, pendingFocusOnComplete, onTurnFinished } = input;
  return useCallback(
    ({ isAbort, isError, message }: ChatFinishEvent) => {
      if (isAbort) {
        notify({ type: 'generationStopped' });
        return;
      }
      if (isError) return; // the conflict hook is the single source for error speech
      notify({ type: 'generationComplete', text: textOf(message), readWhole });
      onTurnFinished(); // refresh the revision so the next send is not stale
      if (focusMode === 'move') pendingFocusOnComplete.current = true;
    },
    [readWhole, focusMode, pendingFocusOnComplete, onTurnFinished],
  );
}
