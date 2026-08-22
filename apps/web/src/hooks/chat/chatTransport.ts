import { DefaultChatTransport } from 'ai';
import { useLayoutEffect, useState } from 'react';

import { type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { chatFetch } from '../../lib/api/chatFetch';

interface ChatRequestInputs {
  conversationId: string | undefined;
  baseRevision: number | undefined;
  modelOverride: string | null | undefined;
}

class LiveChatTransport extends DefaultChatTransport<AnvikaUIMessage> {
  readonly #state: { inputs: ChatRequestInputs };

  constructor(inputs: ChatRequestInputs) {
    const state = { inputs };
    super({
      api: '/api/v1/chat',
      fetch: chatFetch,
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => {
        const { conversationId, baseRevision, modelOverride } = state.inputs;
        return {
          body: {
            ...body,
            id,
            messages,
            trigger,
            messageId,
            ...(conversationId ? { conversationId } : {}),
            ...(typeof baseRevision === 'number' ? { baseRevision } : {}),
            ...(modelOverride ? { modelId: modelOverride } : {}),
          },
        };
      },
    });
    this.#state = state;
  }

  update(inputs: ChatRequestInputs): void {
    this.#state.inputs = inputs;
  }
}

/**
 * Build a chat transport for `useChat` that threads the live `conversationId` into every send.
 *
 * The transport's `prepareSendMessagesRequest` reconstructs the AI SDK default request body
 * (`{ ...body, id, messages, trigger, messageId }`) - because a returned `body` REPLACES the
 * default rather than merging it - and appends `conversationId` (when one is set), `baseRevision`
 * (the optimistic-concurrency cursor, when known), and `modelId` (the per-conversation model
 * override, when set). A layout effect publishes each committed render's values to the stable
 * transport, because AI SDK v6 retains its `Chat` instance when the chat id is unchanged. When the
 * id is absent the field is omitted and the turn stays ephemeral, matching the pre-cutover behavior;
 * when `baseRevision` is absent (a draft not yet in the list) the server skips the conflict check and
 * creates the row.
 *
 * @param conversationId - The target conversation id, or `undefined` for an ephemeral turn. The
 *   latest committed value is available to the stable transport.
 * @param baseRevision - The revision the client last saw for this conversation, or `undefined` when
 *   unknown (a draft). Included whenever it is a number - including `0`, a legitimate backfilled
 *   revision - so a stale send is rejected (409) rather than silently overwriting a newer turn.
 * @param modelOverride - The conversation's per-conversation model override, or `null`/`undefined` to
 *   inherit the default. Sent as `modelId` ONLY when set, so the server resolves it for this turn; when
 *   absent the field is omitted and the server falls back to the settings `selectedModelId`, so an
 *   inheriting conversation always tracks the live default.
 * @returns A stable {@link DefaultChatTransport} posting to `/api/v1/chat` via {@link chatFetch}.
 */
export function useChatTransport(
  conversationId: string | undefined,
  baseRevision?: number,
  modelOverride?: string | null,
): DefaultChatTransport<AnvikaUIMessage> {
  const [transport] = useState(
    () => new LiveChatTransport({ conversationId, baseRevision, modelOverride }),
  );

  useLayoutEffect(() => {
    transport.update({ conversationId, baseRevision, modelOverride });
  }, [transport, conversationId, baseRevision, modelOverride]);

  return transport;
}
