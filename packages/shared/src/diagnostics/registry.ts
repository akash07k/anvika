import { CLIENT_LOG_EVENT_MESSAGES } from '../client-log';
import type { LogLevel } from '../log-entry';
import type { DiagnosticEvent } from './events';

/** Log metadata for a diagnostic event: where, how loudly, and the human-readable message. */
export interface DiagnosticMeta {
  /** Category segments appended after `anvika.client` (e.g. `['keyboard']`). Empty = `anvika.client`. */
  category: readonly string[];
  /** The level the entry is written at; LogTape's per-category config decides what is emitted. */
  level: LogLevel;
  /** The server-controlled, content-free message text for the entry. */
  message: string;
}

/** Static metadata for every non-milestone variant, keyed by event `type`. */
const STATIC_META: Record<Exclude<DiagnosticEvent['type'], 'milestone'>, DiagnosticMeta> = {
  quickNavResolved: { category: ['keyboard'], level: 'info', message: 'Quick-nav resolved' },
  roleJumpResolved: { category: ['keyboard'], level: 'info', message: 'Role jump resolved' },
  stopRequested: { category: ['keyboard'], level: 'info', message: 'Stop requested' },
  focusOutcome: { category: ['focus'], level: 'info', message: 'Focus outcome' },
  quickNavKeypress: { category: ['keyboard'], level: 'debug', message: 'Quick-nav keypress' },
  sendKeyModeToggled: { category: ['keyboard'], level: 'info', message: 'Send key mode toggled' },
  logsDropped: {
    category: [],
    level: 'warning',
    message: 'Diagnostic logs dropped (buffer overflow)',
  },
  logTransportError: { category: [], level: 'warning', message: 'Diagnostic log transport error' },
  clientError: { category: ['error'], level: 'error', message: 'Client error' },
  settingsReloaded: { category: ['settings'], level: 'info', message: 'Settings reloaded' },
  settingsLoadDegraded: {
    category: ['settings'],
    level: 'warning',
    message: 'Settings load degraded; using defaults',
  },
  chatReadinessResolved: { category: ['chat'], level: 'info', message: 'Chat readiness resolved' },
  keyboardShortcutsOpened: {
    category: ['keyboard'],
    level: 'info',
    message: 'Keyboard shortcuts dialog opened',
  },
};

/**
 * Milestone codes that log at `warning` rather than `info`: a surfaced error, a partial-failure
 * connection save (the connection persisted but the key did not), a conversation-changed-elsewhere
 * conflict (a stale send rejected with 409), and a failed conversation rename, delete, batch delete,
 * pin toggle, or branch (the mutation rejected and was rolled back or left unapplied), or a failed
 * per-message action (a pre-flight SDK throw dropped the send/regenerate) - each a recoverable
 * degradation. Every other milestone code stays `info`.
 */
const WARNING_MILESTONE_CODES = new Set([
  'notify-error',
  'notify-connection-save-failed',
  'notify-conversation-changed-elsewhere',
  'notify-conversation-rename-failed',
  'notify-conversation-delete-failed',
  'notify-conversations-batch-delete-failed',
  'notify-conversation-pin-failed',
  'notify-conversation-branch-failed',
  'notify-message-action-failed',
]);

/**
 * Resolve the log metadata for a diagnostic event. Milestone entries derive their level from the
 * code ({@link WARNING_MILESTONE_CODES} log at `warning`, the rest at `info`, matching the prior
 * notification log channel) and reuse the existing server-controlled milestone messages.
 *
 * @param event - The diagnostic event to classify.
 * @returns The category segments, level, and message for writing the entry.
 */
export function diagnosticMeta(event: DiagnosticEvent): DiagnosticMeta {
  if (event.type === 'milestone') {
    return {
      category: [],
      level: WARNING_MILESTONE_CODES.has(event.code) ? 'warning' : 'info',
      message: CLIENT_LOG_EVENT_MESSAGES[event.code],
    };
  }
  return STATIC_META[event.type];
}
