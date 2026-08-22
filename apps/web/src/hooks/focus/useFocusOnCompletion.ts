import { useEffect, useRef } from 'react';

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
 * @param focusRequest - A monotonically increasing number that requests one focus move.
 */
export function useFocusOnCompletion(messages: AnvikaUIMessage[], focusRequest: number): void {
  const completedRequest = useRef(0);

  useEffect(() => {
    if (focusRequest === completedRequest.current) return undefined;
    const index = messages.length - 1;
    const last = messages[index];
    if (!last) return undefined;
    const el = document.getElementById(`message-${messageDomId(last, index)}`);
    if (el) {
      el.focus();
      completedRequest.current = focusRequest;
    }
    return undefined;
  }, [focusRequest, messages]);
}
