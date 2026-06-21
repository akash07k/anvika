import type { AnvikaUIMessage } from '../../lib/message/anvikaMessage';
import { useDeletedElsewhere } from './useDeletedElsewhere';
import { useSyncMessagesFromDetail } from './useSyncMessagesFromDetail';

/** Inputs for {@link useCrossTabSync}. */
export interface CrossTabSyncInput {
  /** The conversation on screen, or `undefined` for a draft. */
  conversationId: string | undefined;
  /** Whether a turn is in flight here (`submitted` or `streaming`). */
  isBusy: boolean;
  /** Whether an inline message editor is open here. */
  isEditing: boolean;
  /** This tab's current `useChat` messages. */
  messages: AnvikaUIMessage[];
  /** `useChat`'s `setMessages`. */
  setMessages: (messages: AnvikaUIMessage[]) => void;
}

/**
 * Compose the per-tab cross-tab concerns for the viewed conversation: the deleted-elsewhere subscriber
 * and the live message-transcript sync. Keeps `ConversationView` to one cross-tab
 * call under the line cap.
 *
 * @param input - See {@link CrossTabSyncInput}.
 * @returns `{ deletedElsewhere }` - true once this conversation was deleted in another tab.
 */
export function useCrossTabSync({
  conversationId,
  isBusy,
  isEditing,
  messages,
  setMessages,
}: CrossTabSyncInput): { deletedElsewhere: boolean } {
  const deletedElsewhere = useDeletedElsewhere(conversationId, isBusy);
  useSyncMessagesFromDetail({ conversationId, isBusy, isEditing, messages, setMessages });
  return { deletedElsewhere };
}
