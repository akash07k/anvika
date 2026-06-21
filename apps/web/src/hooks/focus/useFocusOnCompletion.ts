import { useEffect } from 'react';

import { messageDomId, type AnvikaUIMessage } from '../../lib/message/anvikaMessage';

/**
 * Moves DOM focus to the latest message heading once it appears after a generation completes
 * (focus-on-completion = move). The pending flag is set by `onFinish`; this effect watches
 * `messages` so it runs after the completed assistant message lands in the DOM.
 *
 * Resolves the heading via {@link messageDomId} so a blank id (a local-provider turn before the
 * server heal lands) still maps to the rendered positional heading id.
 *
 * @param messages - The current message list from `useChat`.
 * @param pending - A ref whose `.current` is `true` while a focus move is outstanding.
 */
export function useFocusOnCompletion(
  messages: AnvikaUIMessage[],
  pending: { current: boolean },
): void {
  useEffect(() => {
    if (!pending.current) return undefined;
    const index = messages.length - 1;
    const last = messages[index];
    if (!last) return undefined;
    const el = document.getElementById(`message-${messageDomId(last, index)}`);
    if (el) {
      el.focus();
      pending.current = false;
    }
    return undefined;
  }, [messages, pending]);
}
