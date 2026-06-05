import { z } from 'zod';

/** Allow-listed client log event codes. The client may forward ONLY these - never free-form
 *  text or data - so prompt/response content and secrets cannot cross the logging boundary.
 *  The `notify-*` codes are the diagnostic trail of the notification layer (ADR 0013): the log
 *  channel forwards the event TYPE only (never any payload), so an operator can see which
 *  announcements fired. The periodic `generationProgress` event is deliberately absent - it ticks
 *  every couple of seconds and would flood the screen-reader-navigable log. */
export const CLIENT_LOG_EVENT_CODES = [
  'app-mounted',
  'notify-message-sent',
  'notify-generation-started',
  'notify-generation-complete',
  'notify-generation-stopped',
  'notify-error',
  'notify-message-copied',
  'notify-settings-saved',
  'notify-quick-nav-read',
  'notify-connection-test-started',
  'notify-connection-test-ok',
  'notify-connection-test-ok-no-listing',
  'notify-connection-test-failed',
  'notify-connection-saved',
  'notify-connection-save-failed',
  'notify-connection-removed',
  'notify-connection-enabled-changed',
  'notify-conversation-changed-elsewhere',
  'notify-conversation-updated-elsewhere',
  'notify-conversation-created',
  'notify-conversation-renamed',
  'notify-conversation-rename-failed',
  'notify-conversation-deleted',
  'notify-conversation-delete-failed',
  'notify-conversations-batch-deleted',
  'notify-conversations-batch-delete-failed',
  'notify-conversation-pinned',
  'notify-conversation-unpinned',
  'notify-conversation-pin-failed',
  'notify-conversation-branched',
  'notify-conversation-branch-failed',
  'notify-conversation-switched',
  'notify-pinned-conversation-switched',
  'notify-message-regenerating',
  'notify-message-edited',
  'notify-message-edit-started',
  'notify-latest-message-edit-started',
  'notify-message-edit-cancelled',
  'notify-edit-unavailable-while-generating',
  'notify-message-action-failed',
] as const;

/** Schema accepting exactly one allow-listed {@link CLIENT_LOG_EVENT_CODES} code (the log boundary). */
export const ClientLogEventSchema = z.enum(CLIENT_LOG_EVENT_CODES);
/** A validated client log event code (one of {@link CLIENT_LOG_EVENT_CODES}). */
export type ClientLogEvent = z.infer<typeof ClientLogEventSchema>;

/**
 * Milestone codes that MAY carry content text when the operator opts into content logging: the
 * surfaced error message, the quick-nav read text, and the completed response text. Every other code
 * is codes-only, always. Used by the diagnostic-event schema refine, the client log channel, and the
 * server log writer. The client channel's `contentTextFor` maps the matching notification event types
 * to their text; keep the two lists in sync when a content-bearing event is added.
 */
export const CONTENT_BEARING_CLIENT_LOG_CODES = [
  'notify-error',
  'notify-quick-nav-read',
  'notify-generation-complete',
] as const satisfies readonly ClientLogEvent[];

/**
 * Largest content text (characters) attached to a milestone under the opt-in. The client truncates to
 * this and the schema caps at it, so a long response never rejects the whole diagnostic batch. Kept
 * small (a useful snippet, not the whole response) to keep the screen-reader-navigable log readable.
 */
export const MAX_MILESTONE_TEXT = 400;

/** Canonical, server-controlled message for each event code. */
export const CLIENT_LOG_EVENT_MESSAGES: Record<ClientLogEvent, string> = {
  'app-mounted': 'App mounted',
  'notify-message-sent': 'Notification: message sent',
  'notify-generation-started': 'Notification: generation started',
  'notify-generation-complete': 'Notification: generation complete',
  'notify-generation-stopped': 'Notification: generation stopped',
  'notify-error': 'Notification: error surfaced',
  'notify-message-copied': 'Notification: message copied',
  'notify-settings-saved': 'Notification: settings saved',
  'notify-quick-nav-read': 'Notification: quick-nav read',
  'notify-connection-test-started': 'Notification: connection test started',
  'notify-connection-test-ok': 'Notification: connection test ok',
  'notify-connection-test-ok-no-listing': 'Notification: connection test ok, no listing',
  'notify-connection-test-failed': 'Notification: connection test failed',
  'notify-connection-saved': 'Notification: connection saved',
  'notify-connection-save-failed': 'Notification: connection save failed',
  'notify-connection-removed': 'Notification: connection removed',
  'notify-connection-enabled-changed': 'Notification: connection enabled changed',
  'notify-conversation-changed-elsewhere':
    'Notification: conversation changed elsewhere (conflict)',
  'notify-conversation-updated-elsewhere':
    'Notification: conversation updated in another tab (cross-tab sync)',
  'notify-conversation-created': 'Notification: conversation created',
  'notify-conversation-renamed': 'Notification: conversation renamed',
  'notify-conversation-rename-failed': 'Notification: conversation rename failed',
  'notify-conversation-deleted': 'Notification: conversation deleted',
  'notify-conversation-delete-failed': 'Notification: conversation delete failed',
  'notify-conversations-batch-deleted': 'Notification: conversations batch deleted',
  'notify-conversations-batch-delete-failed': 'Notification: conversations batch delete failed',
  'notify-conversation-pinned': 'Notification: conversation pinned',
  'notify-conversation-unpinned': 'Notification: conversation unpinned',
  'notify-conversation-pin-failed': 'Notification: conversation pin failed',
  'notify-conversation-branched': 'Notification: conversation branched',
  'notify-conversation-branch-failed': 'Notification: conversation branch failed',
  'notify-conversation-switched': 'Notification: conversation switched',
  'notify-pinned-conversation-switched': 'Notification: pinned conversation switched',
  'notify-message-regenerating': 'Notification: message regenerating',
  'notify-message-edited': 'Notification: message edited',
  'notify-message-edit-started': 'Notification: message edit started',
  'notify-latest-message-edit-started': 'Notification: latest message edit started',
  'notify-message-edit-cancelled': 'Notification: message edit cancelled',
  'notify-edit-unavailable-while-generating': 'Notification: edit unavailable while generating',
  'notify-message-action-failed': 'Notification: message action failed',
};
