import { z } from 'zod';

import {
  ClientLogEventSchema,
  CONTENT_BEARING_CLIENT_LOG_CODES,
  MAX_MILESTONE_TEXT,
} from '../client-log';

/** Set form of the content-bearing codes, for the milestone-text refine. */
const CONTENT_BEARING = new Set<string>(CONTENT_BEARING_CLIENT_LOG_CODES);

/** A bound keystroke string from the keymap (e.g. `alt+1`), never typed text. */
const KeySchema = z.string().min(1).max(40);
/** An opaque message id or positional DOM handle; bounded length, never content. */
const HandleSchema = z.string().min(1).max(80);
/** Whether a quick-nav press was a single or a double (focus) press. */
const PressSchema = z.enum(['single', 'double']);
/** The role a message belongs to. */
const RoleSchema = z.enum(['user', 'assistant']);

/**
 * Outcome of a quick-nav press: which slot, single/double, and the resolved target (if any).
 * `alreadyFocused` marks a double-press that re-targeted the message that already had focus.
 */
const QuickNavResolvedSchema = z.strictObject({
  type: z.literal('quickNavResolved'),
  key: KeySchema,
  slot: z.number().int().min(1).max(10),
  press: PressSchema,
  found: z.boolean(),
  total: z.number().int().min(0),
  messageId: HandleSchema.optional(),
  role: RoleSchema.optional(),
  index: z.number().int().min(0).optional(),
  alreadyFocused: z.boolean().optional(),
});

/** Outcome of an Alt+A / Alt+U style latest-by-role jump. */
const RoleJumpResolvedSchema = z.strictObject({
  type: z.literal('roleJumpResolved'),
  key: KeySchema,
  role: RoleSchema,
  found: z.boolean(),
  messageId: HandleSchema.optional(),
  index: z.number().int().min(0).optional(),
});

/** A stop-generation request from the keyboard (the handler does not know if a turn was active). */
const StopRequestedSchema = z.strictObject({
  type: z.literal('stopRequested'),
  key: KeySchema,
});

/** The result of a deferred focus attempt, emitted from the focus helper itself. */
const FocusOutcomeSchema = z.strictObject({
  type: z.literal('focusOutcome'),
  domId: HandleSchema,
  outcome: z.enum(['skipped-empty-id', 'element-not-found', 'focused', 'focus-failed']),
});

/** Per-keystroke quick-nav trace (debug): time since the last press in the same slot. */
const QuickNavKeypressSchema = z.strictObject({
  type: z.literal('quickNavKeypress'),
  key: KeySchema,
  slot: z.number().int().min(1).max(10),
  press: PressSchema,
  sinceLastMs: z.number().int().min(0).optional(),
});

/** Outcome of the Alt+Enter send-key-mode toggle: the resulting mode, or `applied: false` when the
 *  settings were not yet hydrated (a no-op). Content-safe: a bound key, a boolean, and an enum. */
const SendKeyModeToggledSchema = z.strictObject({
  type: z.literal('sendKeyModeToggled'),
  key: KeySchema,
  applied: z.boolean(),
  mode: z.enum(['enter', 'modEnter']).optional(),
});

/** A folded-in notification milestone, carrying an allow-listed code and, under the content opt-in,
 *  an allow-listed `text` (gated to {@link CONTENT_BEARING_CLIENT_LOG_CODES} by the union refine). */
const MilestoneSchema = z.strictObject({
  type: z.literal('milestone'),
  code: ClientLogEventSchema,
  text: z.string().max(MAX_MILESTONE_TEXT).optional(),
});

/** Self-report that the bounded in-flight buffer dropped the oldest entries on overflow. */
const LogsDroppedSchema = z.strictObject({
  type: z.literal('logsDropped'),
  count: z.number().int().min(1),
});

/** Self-report that a batch was undeliverable (poison 400); recorded once, never retried. */
const LogTransportErrorSchema = z.strictObject({
  type: z.literal('logTransportError'),
  status: z.number().int().min(0).optional(),
});

/** A content-safe report of an unhandled client error: the error's CLASS name and a bounded
 *  location only - never the message text, so no content crosses the boundary. For a chat-turn
 *  failure it also carries the opaque, content-free `requestId` that ties it to the server's
 *  `anvika.server.chat` log line for the same turn. */
const ClientErrorSchema = z.strictObject({
  type: z.literal('clientError'),
  name: z.string().min(1).max(120),
  source: HandleSchema.optional(),
  line: z.number().int().min(0).optional(),
  col: z.number().int().min(0).optional(),
  requestId: z.string().min(1).max(64).optional(),
});

/** Settings were reloaded from disk on user request (a content-free success milestone). */
const SettingsReloadedSchema = z.strictObject({
  type: z.literal('settingsReloaded'),
});

/** The keyboard shortcuts dialog was opened via the global Alt+/ hotkey. Content-safe: no
 *  payload - the fact of opening carries no prompt, key text, or secret. */
const KeyboardShortcutsOpenedSchema = z.strictObject({
  type: z.literal('keyboardShortcutsOpened'),
});

/** The stored settings could not be read on load/reload, so defaults were substituted. */
const SettingsLoadDegradedSchema = z.strictObject({
  type: z.literal('settingsLoadDegraded'),
});

/** The chat surface resolved its readiness state on load (content-safe: a single enum). */
const ChatReadinessResolvedSchema = z.strictObject({
  type: z.literal('chatReadinessResolved'),
  state: z.enum(['unconfigured', 'model-unavailable', 'ready']),
});

/**
 * The discriminated union of all content-safe diagnostic events. Every variant is a `strictObject`
 * of named scalar fields only. The only free-text field anywhere is the milestone `text`, which the
 * refine restricts to the content-bearing codes, so prompt/response content cannot ride any other
 * event.
 */
export const DiagnosticEventSchema = z
  .discriminatedUnion('type', [
    QuickNavResolvedSchema,
    RoleJumpResolvedSchema,
    StopRequestedSchema,
    FocusOutcomeSchema,
    QuickNavKeypressSchema,
    SendKeyModeToggledSchema,
    MilestoneSchema,
    LogsDroppedSchema,
    LogTransportErrorSchema,
    ClientErrorSchema,
    SettingsReloadedSchema,
    SettingsLoadDegradedSchema,
    ChatReadinessResolvedSchema,
    KeyboardShortcutsOpenedSchema,
  ])
  .refine(
    (event) => {
      if (event.type !== 'milestone') return true;
      if (event.text === undefined) return true;
      return CONTENT_BEARING.has(event.code);
    },
    { message: 'milestone text is only allowed on content-bearing codes', path: ['text'] },
  );

/** A single diagnostic event. */
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>;

/**
 * One log entry: a client envelope (`seq` monotonic order, `at` client epoch ms) wrapping a
 * typed event. The event is nested (not spread) so the strict variants keep rejecting unknown
 * fields while the envelope still validates.
 */
export const DiagnosticEntrySchema = z.strictObject({
  seq: z.number().int().min(0),
  at: z.number().int().min(0),
  event: DiagnosticEventSchema,
});

/** A single diagnostic entry (envelope + event). */
export type DiagnosticEntry = z.infer<typeof DiagnosticEntrySchema>;

/** Largest number of entries accepted in one POST (server-enforced upper bound). */
export const MAX_DIAGNOSTIC_BATCH = 100;

/** The request body of `POST /api/v1/log`: a bounded, non-empty batch of entries. */
export const DiagnosticBatchSchema = z.strictObject({
  entries: z.array(DiagnosticEntrySchema).min(1).max(MAX_DIAGNOSTIC_BATCH),
});

/** The validated diagnostic batch body. */
export type DiagnosticBatch = z.infer<typeof DiagnosticBatchSchema>;
