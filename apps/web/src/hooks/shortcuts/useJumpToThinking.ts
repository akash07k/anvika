import { useCallback } from 'react';

import { messageDomId, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { notify } from '../../notifications/notifier';

/**
 * Build the Alt+R handler: focus the latest ASSISTANT message's Thinking disclosure (the `summary`
 * element carrying id `thinking-${domId}`), or announce a content-safe no-op when the latest
 * assistant turn has no thinking region.
 *
 * Scan backward through the messages array to find the most recent assistant message. If that
 * message has a rendered `thinking-${domId}` element in the DOM, focus it. If the latest assistant
 * message exists but has no thinking region (e.g. thinking was disabled for that turn), announce
 * the no-op and stop -- do NOT continue scanning older assistant turns. This keeps the action
 * scoped to "the latest assistant turn's thinking" rather than an arbitrarily old one.
 *
 * A user-role last message (e.g. a message just sent, with no reasoning) must not mask an earlier
 * assistant's thinking region: the backward scan skips non-assistant messages before checking.
 *
 * @param messages - The current conversation messages.
 * @returns A stable callback that jumps to the latest assistant turn's thinking, or announces
 *   the no-op when no such region exists or no assistant message is present.
 */
export function useJumpToThinking(messages: AnvikaUIMessage[]): () => void {
  return useCallback(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'assistant') continue;
      const el = document.getElementById(`thinking-${messageDomId(message, index)}`);
      if (el) {
        el.focus();
        return;
      }
      // The latest assistant message exists but has no thinking region. Stop here and announce
      // the no-op rather than jumping to an older assistant's thinking.
      break;
    }
    notify({ type: 'noThinkingToJumpTo' });
  }, [messages]);
}
