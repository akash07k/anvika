import { z } from 'zod';

import { ReasoningEffortSchema } from '../reasoning/effort';
import { ConnectionsSchema } from './connection';
import { KeymapSchema } from './keymap';

/**
 * The settings schema version. This is the v1 baseline: the public repository ships a single
 * starting schema with no historical migrations. The stored settings row carries the version it was
 * written at; on read the server migrates it up to this version (a no-op while only v1 exists), then
 * validates. The version column and the migrate-on-read machinery are deliberately KEPT so future
 * additive or breaking changes can register a migration and bump this constant; a stored version
 * greater than this (a row written by a newer build) fails soft to defaults (see `loadSettings`).
 */
export const CURRENT_SETTINGS_VERSION = 1;

/**
 * The settings schema - the single source of truth for validation, defaults, types, and form
 * rendering hints. Every field carries a default and `.meta()` (label, description,
 * category). Behaviour settings are persisted now but not yet active; connection credentials are
 * consumed by the model layer. Secrets are inside `connections` elements (marked there).
 */
export const SettingsSchema = z.object({
  connections: ConnectionsSchema,
  selectedModelId: z.string().default('').meta({
    label: 'Selected model',
    description: 'Namespaced connectionId:model id.',
    category: 'models',
  }),
  userName: z.string().trim().max(40).default('You').meta({
    label: 'Your name',
    description: 'Shown as the heading on your messages.',
    category: 'display',
  }),
  assistantName: z.string().trim().max(40).default('Assistant').meta({
    label: 'Assistant name',
    description: 'Shown as the heading on assistant messages and the assistant Copy button.',
    category: 'display',
  }),
  currency: z.enum(['USD', 'INR']).default('USD').meta({
    label: 'Currency',
    description: 'Currency for the estimated cost readout. INR uses the rate below.',
    category: 'display',
  }),
  inrPerUsd: z.number().gt(0).lte(100000).default(95.11).meta({
    label: 'INR per USD',
    description: 'How many rupees one US dollar is worth; converts the USD cost estimate to INR.',
    category: 'display',
  }),
  autoRefreshFxRate: z.boolean().default(false).meta({
    label: 'Automatically refresh the exchange rate',
    description:
      'When on, refresh the USD-to-INR rate on startup if it is more than a few days old.',
    category: 'display',
  }),
  inrPerUsdUpdatedAt: z.number().int().nonnegative().nullable().default(null).meta({
    label: 'Exchange rate last updated',
    description: 'When the INR-per-USD rate was last set, in epoch milliseconds; null means never.',
    category: 'display',
  }),
  timestampWeekday: z.boolean().default(true).meta({
    label: 'Show weekday in timestamps',
    description: 'Prefix a not-today message time with its weekday, like "Monday".',
    category: 'display',
  }),
  timestampDateStyle: z.enum(['day-first', 'month-first']).default('day-first').meta({
    label: 'Date style',
    description: 'Day first ("8th June 2026") or month first ("June 8, 2026").',
    category: 'display',
  }),
  timestampHourCycle: z.enum(['h12', 'h24']).default('h12').meta({
    label: 'Clock',
    description: '12-hour with AM/PM ("1:53 PM") or 24-hour ("13:53").',
    category: 'display',
  }),
  timestampSeconds: z.boolean().default(true).meta({
    label: 'Show seconds',
    description: 'Include seconds in a message time ("1:53:42 PM") or omit them ("1:53 PM").',
    category: 'display',
  }),
  announcementPeriodMs: z.int().min(250).max(60000).default(2000).meta({
    label: 'Announcement period (ms)',
    description: 'Heartbeat interval while generating.',
    category: 'accessibility',
  }),
  readWholeOnComplete: z
    .boolean()
    .default(false)
    .meta({ label: 'Read whole response on completion', category: 'accessibility' }),
  focusOnCompletion: z.enum(['keep', 'move']).default('keep').meta({
    label: 'Focus on completion',
    description: 'Keep focus in the composer or move to the response.',
    category: 'accessibility',
  }),
  sendKeyMode: z.enum(['enter', 'modEnter']).default('modEnter').meta({
    label: 'Send key mode',
    description: 'Enter sends, or Ctrl/Cmd+Enter sends.',
    category: 'accessibility',
  }),
  quickNavSinglePressReads: z
    .enum(['descriptor', 'full'])
    .default('descriptor')
    .meta({ label: 'Quick-nav single press reads', category: 'accessibility' }),
  reasoningEffort: ReasoningEffortSchema.default('medium').meta({
    label: 'Thinking effort',
    description:
      'How much reasoning-capable models think before answering. Off disables thinking; low, medium, and high spend progressively more. Only applies to models that support thinking.',
    category: 'accessibility',
  }),
  quickNavDoublePressMs: z
    .int()
    .min(100)
    .max(2000)
    .default(500)
    .meta({ label: 'Quick-nav double-press window (ms)', category: 'accessibility' }),
  quickNavLengthCue: z.enum(['count-first', 'count-after']).default('count-first').meta({
    label: 'Quick-nav length cue position',
    description:
      'A truncated quick-nav preview always ends with the remaining word count; this chooses whether the total word count is also spoken first. Only applies when single press reads the descriptor.',
    category: 'accessibility',
  }),
  quickNavPreviewWords: z.int().min(5).max(200).default(40).meta({
    label: 'Quick-nav preview length (words)',
    description:
      'How many words the quick-nav descriptor previews before truncating. Only applies when single press reads the descriptor.',
    category: 'accessibility',
  }),
  hotkeyBindings: KeymapSchema,
});

/** The validated settings object (plaintext secrets; server-only). */
export type Settings = z.infer<typeof SettingsSchema>;
