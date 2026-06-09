import { formatTwoToThreeDecimals } from '../../lib/format/formatDecimals';
import { announce } from '../announce';
import type { NotificationEvent, NotificationPriority } from '../events';
import { conversationSpeech, isConversationSpeechEvent } from './conversationSpeech';
import { isMessageSpeechEvent, messageForMessageEvent } from './messageSpeech';

/** Join problem labels into the shared "could not load models from" clause, or '' when none. */
function problemClause(labels: string[]): string {
  return labels.length > 0 ? `. Could not load models from: ${labels.join(', ')}.` : '';
}

/** A speech announcement: the text to speak and the priority to speak it at. */
export interface SpeechAnnouncement {
  message: string;
  priority: NotificationPriority;
}

/**
 * Pure mapping from a semantic event to the speech announcement it produces, or `null` for events
 * that are deliberately silent for speech (for example `messageSent`, reserved for a future audio
 * cue). This is the single source of the announcement wording and priority.
 */
export function messageForEvent(event: NotificationEvent): SpeechAnnouncement | null {
  if (isConversationSpeechEvent(event)) return conversationSpeech(event);
  if (isMessageSpeechEvent(event)) return messageForMessageEvent(event);
  switch (event.type) {
    case 'messageSent':
      return null;
    case 'generationStarted':
      return { message: 'Generating response', priority: 'normal' };
    case 'generationProgress':
      return {
        message: `${event.thinking ? 'Thinking' : 'Generating'}, ${event.seconds} ${event.seconds === 1 ? 'second' : 'seconds'}`,
        priority: 'normal',
      };
    case 'generationComplete':
      return {
        message: event.readWhole ? `Response complete. ${event.text}` : 'Response complete',
        priority: 'normal',
      };
    case 'generationStopped':
      return { message: 'Generation stopped', priority: 'normal' };
    case 'thinkingStarted':
      return { message: 'Thinking', priority: 'normal' };
    case 'thinkingComplete':
      return {
        message: `Thought for ${event.seconds} ${event.seconds === 1 ? 'second' : 'seconds'}. Answering.`,
        priority: 'normal',
      };
    case 'error':
      return { message: event.message, priority: 'high' };
    case 'messageCopied':
      return { message: 'Message copied', priority: 'normal' };
    case 'messageCopyFailed':
      return { message: 'Copy failed', priority: 'high' };
    case 'settingsSaved':
      return { message: 'Settings saved', priority: 'normal' };
    case 'settingsSaveFailed':
      return { message: event.message, priority: 'high' };
    case 'quickNavRead':
      return { message: event.text, priority: 'normal' };
    case 'alreadyInComposer':
      return { message: 'Already in the message box', priority: 'normal' };
    case 'nothingToStop':
      return { message: 'No response is generating', priority: 'normal' };
    case 'composerEmpty':
      return { message: 'Type a message to send', priority: 'normal' };
    case 'noMessageForRole':
      return {
        message:
          event.role === 'assistant'
            ? 'No assistant response yet'
            : 'You have not sent a message yet',
        priority: 'normal',
      };
    case 'quickNavEmpty':
      return { message: 'No message there yet', priority: 'normal' };
    case 'quickNavAlreadyFocused':
      return { message: 'Already focused on this message', priority: 'normal' };
    case 'sendKeyModeChanged': {
      const target =
        event.mode === 'enter' ? 'Enter' : event.isMac ? 'Command+Enter' : 'Control+Enter';
      return { message: `Send key mode changed to ${target}`, priority: 'normal' };
    }
    case 'settingsNotReady':
      return { message: 'Settings are still loading', priority: 'normal' };
    case 'settingsReloaded':
      return { message: 'Settings reloaded', priority: 'normal' };
    case 'settingsLoadDegraded':
      return { message: 'Settings file could not be read; using defaults', priority: 'high' };
    case 'connectionTestStarted':
      return { message: 'Testing the connection', priority: 'normal' };
    case 'connectionTestStillRunning':
      return { message: 'Still testing the connection', priority: 'normal' };
    case 'connectionTestOk':
      return {
        message: `Connection OK, found ${event.modelCount} ${event.modelCount === 1 ? 'model' : 'models'}`,
        priority: 'normal',
      };
    case 'connectionTestOkNoListing':
      return { message: 'Connection OK; this provider does not list models', priority: 'normal' };
    case 'connectionTestFailed':
      return { message: `Connection failed: ${event.category}`, priority: 'high' };
    case 'connectionSaved':
      return { message: `Connection ${event.label} saved`, priority: 'normal' };
    case 'connectionSaveFailed':
      return {
        message: `Saved ${event.label}, but setting its key failed. Edit the connection to try again.`,
        priority: 'high',
      };
    case 'connectionRemoved':
      // High priority: a remove confirmation must survive the focus churn of the dialog closing and
      // focus moving to the next row, otherwise a polite announcement is dropped and the user gets no
      // confirmation their connection was deleted (manual SR pass).
      return {
        message: `Connection ${event.label} removed${event.modelCleared ? '; selected model cleared' : ''}`,
        priority: 'high',
      };
    case 'fxRefreshStarted':
      return { message: 'Updating exchange rate', priority: 'normal' };
    case 'fxRefreshOk':
      return {
        message: `Exchange rate updated. INR per USD is now ${formatTwoToThreeDecimals(event.rate)}.`,
        priority: 'normal',
      };
    case 'fxRefreshFailed':
      return {
        message: 'Could not update the exchange rate. The existing rate is unchanged.',
        priority: 'high',
      };
    case 'connectionEnabledChanged':
      return {
        message: `Connection ${event.label} ${event.enabled ? 'activated' : 'deactivated'}`,
        priority: 'high',
      };
    case 'modelsRefreshStarted':
      return { message: 'Refreshing models', priority: 'normal' };
    case 'modelsRefreshOk':
      return {
        message: `Models refreshed, ${event.count} ${event.count === 1 ? 'model' : 'models'} available${problemClause(event.problemLabels)}`,
        priority: 'normal',
      };
    case 'modelsRefreshFailed':
      return {
        message: 'Could not refresh models. The existing list is unchanged.',
        priority: 'high',
      };
    case 'modelDiscoveryProblem':
      return {
        message: `Could not load models from: ${event.labels.join(', ')}. Check the connections list.`,
        priority: 'high',
      };
    case 'reasoningEffortChanged':
      return {
        message: event.effort === 'off' ? 'Thinking off' : `Thinking, ${event.effort}`,
        priority: 'normal',
      };
    case 'noThinkingToJumpTo':
      return { message: 'No thinking on the latest message', priority: 'normal' };
    case 'reasoningOverrideSaveFailed':
      return { message: 'Could not save the thinking effort', priority: 'high' };
    default: {
      // Exhaustiveness guard: adding a NotificationEvent variant without a case here is a
      // compile error, and this gives the switch a terminal return for consistent-return.
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/** The speech output channel: speaks the announcement an event maps to, via {@link announce}. */
export function speechChannel(event: NotificationEvent): void {
  const announcement = messageForEvent(event);
  if (announcement) announce(announcement.message, announcement.priority);
}
