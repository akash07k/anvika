import { DefaultChatTransport } from 'ai';
import { useMemo, useRef } from 'react';

import { type AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { chatFetch } from '../../lib/api/chatFetch';

/**
 * Build a chat transport for `useChat` that threads the live `conversationId` into every send.
 *
 * The transport's `prepareSendMessagesRequest` reconstructs the AI SDK default request body
 * (`{ ...body, id, messages, trigger, messageId }`) - because a returned `body` REPLACES the
 * default rather than merging it - and appends `conversationId` (when one is set), `baseRevision`
 * (the optimistic-concurrency cursor, when known), and `modelId` (the per-conversation model
 * override, when set). Reading each from a ref (not a closed-over value) means a remount, id change,
 * a fresher revision, or a model switch is picked up on the next send without rebuilding the
 * transport. When the id is absent the field is omitted and the turn stays ephemeral, matching
 * the pre-cutover behavior; when `baseRevision` is absent (a draft not yet in the list) the server
 * skips the conflict check and creates the row.
 *
 * @param conversationId - The target conversation id, or `undefined` for an ephemeral turn. The
 *   latest value is captured each render; the transport itself is memoized once per mount.
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
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const baseRevisionRef = useRef(baseRevision);
  baseRevisionRef.current = baseRevision;
  const modelOverrideRef = useRef(modelOverride);
  modelOverrideRef.current = modelOverride;
  return useMemo(
    () =>
      new DefaultChatTransport<AnvikaUIMessage>({
        api: '/api/v1/chat',
        fetch: chatFetch,
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body }) => {
          const target = conversationIdRef.current;
          const revision = baseRevisionRef.current;
          const model = modelOverrideRef.current;
          return {
            body: {
              ...body,
              id,
              messages,
              trigger,
              messageId,
              ...(target ? { conversationId: target } : {}),
              ...(typeof revision === 'number' ? { baseRevision: revision } : {}),
              ...(model ? { modelId: model } : {}),
            },
          };
        },
      }),
    // The transport reads the live id from the ref, so it never needs rebuilding (the ref is stable).
    [],
  );
}
