import type { NotificationEvent } from '../events';
import type { SpeechAnnouncement } from './speech';

/**
 * The conversation-lifecycle event types whose speech wording lives in this module: create, rename,
 * delete (single and batch), pin/unpin, branch, quick-nav switch and its empty no-op, the pinned
 * quick-nav switch and its empty no-op, the no-pinned-conversations, cannot-pin-empty, and
 * list-still-loading guard notices, plus their failures and the changed-elsewhere notice. Kept as a `const` tuple so
 * {@link ConversationSpeechEvent} can be derived from it and the membership {@link Set} stays in
 * lockstep with the switch.
 */
const CONVERSATION_SPEECH_TYPES = [
  'conversationChangedElsewhere',
  'conversationUpdatedElsewhere',
  'conversationCreated',
  'conversationRenamed',
  'conversationRenameFailed',
  'conversationDeleted',
  'conversationDeleteFailed',
  'conversationsBatchDeleted',
  'conversationsBatchDeleteFailed',
  'conversationPinned',
  'conversationUnpinned',
  'conversationPinFailed',
  'conversationBranched',
  'conversationBranchFailed',
  'conversationSwitched',
  'conversationQuickNavEmpty',
  'pinnedConversationSwitched',
  'pinnedQuickNavEmpty',
  'noPinnedConversations',
  'cannotPinEmptyConversation',
  'conversationListLoading',
  'conversationModelChanged',
  'modelOverrideSaveFailed',
] as const;

/** A {@link NotificationEvent} narrowed to the conversation-lifecycle events this module speaks. */
export type ConversationSpeechEvent = Extract<
  NotificationEvent,
  { type: (typeof CONVERSATION_SPEECH_TYPES)[number] }
>;

/** Membership set for the O(1) {@link isConversationSpeechEvent} predicate. */
const CONVERSATION_SPEECH_TYPE_SET: ReadonlySet<string> = new Set(CONVERSATION_SPEECH_TYPES);

/**
 * Spoken ordinal for each conversation quick-nav slot, indexed by `slot - 1` (slot 1 is index 0). A
 * fixed phrase per slot so the switch announcement is content-safe: it names ONLY the position, never
 * a conversation id, title, or message text.
 */
const SLOT_ORDINALS = [
  'most recent',
  '2nd most recent',
  '3rd most recent',
  '4th most recent',
  '5th most recent',
  '6th most recent',
  '7th most recent',
  '8th most recent',
  '9th most recent',
  '10th most recent',
] as const;

/**
 * Whether `event` is one of the conversation-lifecycle events handled by {@link conversationSpeech}.
 * Used by `messageForEvent` to delegate before its own switch, and it narrows the type so the caller
 * may pass the result straight to {@link conversationSpeech}.
 *
 * @param event - The event to test.
 * @returns True when `event.type` is a conversation-lifecycle speech event.
 */
export function isConversationSpeechEvent(
  event: NotificationEvent,
): event is ConversationSpeechEvent {
  return CONVERSATION_SPEECH_TYPE_SET.has(event.type);
}

/**
 * Pure mapping from a conversation-lifecycle event to its speech announcement. Every phrase is fixed
 * or carries only a content-safe count - never a conversation id, title, or server error message.
 * Most are `high` priority so the confirmation survives the focus churn of a context menu, dialog, or
 * navigation; the few purely informational ones (`conversationCreated`) stay `normal`.
 *
 * @param event - The conversation-lifecycle event to speak.
 * @returns The speech announcement (message text and priority).
 */
export function conversationSpeech(event: ConversationSpeechEvent): SpeechAnnouncement {
  switch (event.type) {
    case 'conversationChangedElsewhere':
      // Assertive (high): the user must know their message was not sent so they can resend.
      return {
        message: 'This conversation changed elsewhere. Your message was not sent; please resend.',
        priority: 'high',
      };
    case 'conversationUpdatedElsewhere':
      // Normal priority: informational cross-tab sync notice; no action required from the user.
      // Carries NO conversation id, title, or message text - purely a generic fixed phrase.
      return { message: 'Conversation updated in another tab', priority: 'normal' };
    case 'conversationCreated':
      return { message: 'New conversation', priority: 'normal' };
    case 'conversationRenamed':
      // High priority: a rename confirmation must survive the focus churn of the context menu and the
      // inline field closing, otherwise a polite announcement is dropped (mirrors connectionRemoved).
      return { message: 'Conversation renamed', priority: 'high' };
    case 'conversationRenameFailed':
      // High priority: a silent failure is the worst outcome for a screen-reader user; the fixed phrase
      // never carries the title or the server error, so it stays content-safe.
      return { message: 'Could not rename the conversation. Please try again.', priority: 'high' };
    case 'conversationDeleted':
      // High priority: a delete confirmation must survive the dialog-close + focus-move churn, the same
      // reasoning as connectionRemoved.
      return { message: 'Conversation deleted', priority: 'high' };
    case 'conversationDeleteFailed':
      // High priority so the failed delete is not silent; fixed content-safe phrase (no id/title/error).
      return { message: 'Could not delete the conversation. Please try again.', priority: 'high' };
    case 'conversationsBatchDeleted':
      // High priority for the same churn reason as the single delete; the count is content-safe (a
      // number, never a title or id), mirroring connectionRemoved's audible confirmation.
      return {
        message: `Deleted ${event.count} ${event.count === 1 ? 'conversation' : 'conversations'}`,
        priority: 'high',
      };
    case 'conversationsBatchDeleteFailed':
      // High priority so the failed batch delete is not silent; fixed content-safe phrase (no
      // ids/titles/count/error). The selection is kept so the user can retry.
      return { message: 'Could not delete the conversations. Please try again.', priority: 'high' };
    case 'conversationPinned':
      // High priority: a pin confirmation must survive the context-menu focus churn, otherwise a polite
      // announcement is dropped (mirrors conversationRenamed).
      return { message: 'Conversation pinned', priority: 'high' };
    case 'conversationUnpinned':
      // High priority for the same context-menu focus-churn reason as conversationPinned.
      return { message: 'Conversation unpinned', priority: 'high' };
    case 'conversationPinFailed':
      // High priority so the failed pin toggle is not silent; fixed content-safe phrase (no id/title/error).
      return { message: 'Could not change the pin. Please try again.', priority: 'high' };
    case 'conversationBranched':
      // High priority: a branch confirmation must survive the context-menu + navigation focus churn,
      // otherwise a polite announcement is dropped (mirrors conversationPinned).
      return { message: 'Conversation branched', priority: 'high' };
    case 'conversationBranchFailed':
      // High priority so the failed branch is not silent; fixed content-safe phrase (no id/title/error).
      return { message: 'Could not branch the conversation. Please try again.', priority: 'high' };
    case 'conversationSwitched':
      // High priority to survive the navigation focus churn. Names ONLY the slot ordinal - never a
      // conversation id, title, or message text - so it stays content-safe.
      return {
        message: `Switched to the ${SLOT_ORDINALS[event.slot - 1]} conversation`,
        priority: 'high',
      };
    case 'conversationQuickNavEmpty':
      // Normal priority no-op feedback: the slot held no conversation, so nothing was switched to.
      return { message: 'No conversation in that slot', priority: 'normal' };
    case 'pinnedConversationSwitched':
      // High priority to survive the navigation focus churn. Names ONLY the slot ordinal (reusing the
      // shared SLOT_ORDINALS) - never a conversation id, title, or message text - so it is content-safe.
      return {
        message: `Switched to the ${SLOT_ORDINALS[event.slot - 1]} pinned conversation`,
        priority: 'high',
      };
    case 'pinnedQuickNavEmpty':
      // Normal priority no-op feedback: the pinned slot held no conversation, so nothing was switched to.
      return { message: 'No pinned conversation in that slot', priority: 'normal' };
    case 'noPinnedConversations':
      // Normal priority no-op feedback: Ctrl+Alt+C fired with nothing pinned, so there is no jump target.
      return { message: 'No pinned conversations', priority: 'normal' };
    case 'cannotPinEmptyConversation':
      // High priority: a refused-action guard notice must not be silent (mirrors
      // editUnavailableWhileGenerating); the fixed phrase carries no id, title, or text.
      return { message: 'Cannot pin an empty conversation', priority: 'high' };
    case 'conversationListLoading':
      // High priority: a refused-action guard notice must not be silent (mirrors
      // cannotPinEmptyConversation); the fixed phrase carries no id, title, or text.
      return {
        message: 'The conversation list is still loading. Please try again.',
        priority: 'high',
      };
    case 'conversationModelChanged':
      // Normal priority: an informational confirmation of the new model. Names ONLY the model's
      // display label (connection/model metadata) - never a conversation id, title, or message text.
      return { message: `Model set to ${event.model}`, priority: 'normal' };
    case 'modelOverrideSaveFailed':
      // High priority so the failed model change is not silent; fixed content-safe phrase (no
      // id/title/model/error). Mirrors conversationRenameFailed.
      return { message: 'Could not change the model. Please try again.', priority: 'high' };
    default: {
      // Exhaustiveness guard: adding a conversation-speech variant without a case here is a compile error.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
