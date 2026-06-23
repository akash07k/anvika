import type { NotificationEvent } from '../events';
import type { SpeechAnnouncement } from './speech';

/**
 * The per-message event types whose speech wording lives in this module: regenerate, edit submit, the
 * two edit-open variants (menu and Ctrl+Up), edit cancel, the edit-while-generating guard notice, and
 * the generic action-failed notice. Kept as a `const` tuple so {@link MessageSpeechEvent} can be
 * derived from it and the membership {@link Set} stays in lockstep with the switch.
 */
const MESSAGE_SPEECH_TYPES = [
  'messageRegenerating',
  'messageEdited',
  'messageEditStarted',
  'latestMessageEditStarted',
  'messageEditCancelled',
  'editUnavailableWhileGenerating',
  'messageActionFailed',
] as const;

/** A {@link NotificationEvent} narrowed to the per-message events this module speaks. */
export type MessageSpeechEvent = Extract<
  NotificationEvent,
  { type: (typeof MESSAGE_SPEECH_TYPES)[number] }
>;

/** Membership set for the O(1) {@link isMessageSpeechEvent} predicate. */
const MESSAGE_SPEECH_TYPE_SET: ReadonlySet<string> = new Set(MESSAGE_SPEECH_TYPES);

/**
 * Whether `event` is one of the per-message events handled by {@link messageForMessageEvent}. Used by
 * `messageForEvent` to delegate before its own switch, and it narrows the type so the caller may pass
 * the result straight to {@link messageForMessageEvent}.
 *
 * @param event - The event to test.
 * @returns True when `event.type` is a per-message speech event.
 */
export function isMessageSpeechEvent(event: NotificationEvent): event is MessageSpeechEvent {
  return MESSAGE_SPEECH_TYPE_SET.has(event.type);
}

/**
 * Pure mapping from a per-message event to its speech announcement. Every phrase is fixed - never the
 * message id or the edited/response text - so it stays content-safe. The lifecycle confirmations are
 * `high` priority so they survive the editor-close / context-menu focus churn; the guard notices
 * (edit-while-generating, action-failed) are likewise `high` so a screen-reader user is not left
 * without feedback when an action is refused or fails.
 *
 * @param event - The per-message event to speak.
 * @returns The speech announcement (message text and priority).
 */
export function messageForMessageEvent(event: MessageSpeechEvent): SpeechAnnouncement {
  switch (event.type) {
    case 'messageRegenerating':
      // High priority: the confirmation must survive the context-menu focus churn, otherwise a polite
      // announcement is dropped (mirrors conversationBranched). Fixed phrase - never the id or text.
      return { message: 'Regenerating response', priority: 'high' };
    case 'messageEdited':
      // High priority: the confirmation must survive the editor-close focus churn (mirrors
      // messageRegenerating). Fixed phrase - never the edited text or the message id. Worded "Message
      // edited" (past tense) so the submit reads distinctly from the open ("Editing message").
      return { message: 'Message edited, generating response', priority: 'high' };
    case 'messageEditStarted':
      // High priority: the announcement must survive the focus move into the editor when the menu Edit
      // item opens it (mirrors messageEdited). Fixed phrase - never the message id or text.
      return { message: 'Editing message', priority: 'high' };
    case 'latestMessageEditStarted':
      // High priority: the announcement must survive the focus move into the editor on Ctrl+Up
      // (mirrors messageEditStarted). Fixed phrase - never the message id or text.
      return { message: 'Editing last message', priority: 'high' };
    case 'messageEditCancelled':
      // High priority: the cancel confirmation must survive the editor-close focus churn (mirrors
      // messageEdited). Fixed phrase - never the message id or text.
      return { message: 'Editing cancelled', priority: 'high' };
    case 'editUnavailableWhileGenerating':
      // High priority: the user pressed Ctrl+Up while a response was generating; the guard refused the
      // edit, so a screen-reader user must hear WHY nothing opened. Fixed content-safe phrase.
      return { message: 'Cannot edit while a response is generating', priority: 'high' };
    case 'messageActionFailed':
      // High priority: a pre-flight SDK validation throw dropped the action; the failure must not be
      // silent for a screen-reader user. Fixed content-safe phrase (never the SDK error or any id).
      return { message: 'That action could not be completed', priority: 'high' };
    default: {
      // Exhaustiveness guard: adding a message-speech variant without a case here is a compile error.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
