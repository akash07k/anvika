import { useCallback } from 'react';

import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { textOf } from '../../lib/message/messageText';
import { notify } from '../../notifications/notifier';

/** Inputs for {@link useChatFinishHandler}. */
export interface ChatFinishHandlerInput {
  /** Whether the completed response body should be read in full (independent of focus mode). */
  readWhole: boolean;
  /** Focus-on-completion mode; `move` requests a focus move to the latest response heading. */
  focusMode: 'keep' | 'move';
  /** Requests that the owner arm its focus-on-completion effect. */
  onFocusRequested: () => void;
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
 * next send is not stale, and requests focus-on-completion when the mode is `move`.
 *
 * @param input - The completion settings and the post-finish revision refresh.
 * @returns A stable `onFinish` handler for `useChat`.
 */
export function useChatFinishHandler(
  input: ChatFinishHandlerInput,
): (event: ChatFinishEvent) => void {
  const { readWhole, focusMode, onFocusRequested, onTurnFinished } = input;
  return useCallback(
    ({ isAbort, isError, message }: ChatFinishEvent) => {
      if (isAbort) {
        notify({ type: 'generationStopped' });
        return;
      }
      if (isError) return; // the conflict hook is the single source for error speech
      notify({ type: 'generationComplete', text: textOf(message), readWhole });
      onTurnFinished(); // refresh the revision so the next send is not stale
      if (focusMode === 'move') onFocusRequested();
    },
    [readWhole, focusMode, onFocusRequested, onTurnFinished],
  );
}
