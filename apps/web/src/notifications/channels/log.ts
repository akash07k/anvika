import { MAX_MILESTONE_TEXT } from '@anvika/shared/client-log';

import { clientLog } from '../../lib/logger';
import { useRuntimeConfigStore } from '../../stores/runtimeConfigStore';
import type { NotificationEvent } from '../events';
import { LOG_CODES } from './log-codes';

/** The allow-listed content text for the three content-bearing events, or undefined otherwise. These
 *  three event types are the notification-event counterparts of `CONTENT_BEARING_CLIENT_LOG_CODES`
 *  (the shared allow-list the schema refine and server gate enforce); keep the two lists in sync when
 *  a content-bearing event is added. */
function contentTextFor(event: NotificationEvent): string | undefined {
  switch (event.type) {
    case 'error':
      return event.message;
    case 'quickNavRead':
      return event.text;
    case 'generationComplete':
      return event.text;
    default:
      return undefined;
  }
}

/**
 * The diagnostic log channel (ADR 0013): forwards each notification as an allow-listed event code
 * to the server log, so an operator can trace which announcements fired. It renders events to the
 * log medium exactly as the speech channel renders them to speech - the notifier stays unaware.
 *
 * The level for each code is derived server-side from the code itself (the `error` code logs at
 * `warning`, the rest at `info`). Codes only when the content opt-in is off (never-log-content
 * default). Under the opt-in, the three content-bearing events (`error`, `quickNavRead`,
 * `generationComplete`) attach their allow-listed text, truncated to `MAX_MILESTONE_TEXT`.
 * `quickNavRead` is also only forwarded at all when the opt-in is on.
 */
export function logChannel(event: NotificationEvent): void {
  const logContent = useRuntimeConfigStore.getState().logContent;
  // quickNavRead is normally skipped (LOG_CODES maps it to null), but under the content opt-in it
  // is forwarded carrying its read text. This keeps the codes-only floor unchanged when logging is
  // off. This branch relies on LOG_CODES['quickNavRead'] staying null: if it is ever mapped to a
  // real code, remove this special-case or the general path below will double-log the line.
  if (event.type === 'quickNavRead') {
    if (logContent && event.text) {
      clientLog('notify-quick-nav-read', event.text.slice(0, MAX_MILESTONE_TEXT));
    }
    return;
  }
  const code = LOG_CODES[event.type];
  if (!code) return;
  if (logContent) {
    const raw = contentTextFor(event);
    if (raw) {
      clientLog(code, raw.slice(0, MAX_MILESTONE_TEXT));
      return;
    }
  }
  clientLog(code);
}
