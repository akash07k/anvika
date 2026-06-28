/** A server validation issue (a Zod issue subset): the path to the field and its message. */
interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

/** Top-level settings key -> field id (ids differ from keys; see SettingsForm). */
const TOP_LEVEL_FIELD_ID: Record<string, string> = {
  selectedModelId: 'selected-model',
  announcementPeriodMs: 'announcement-period',
  readWholeOnComplete: 'read-whole',
  focusOnCompletion: 'focus-on-completion',
  sendKeyMode: 'send-key',
  quickNavSinglePressReads: 'quicknav-reads',
  quickNavDoublePressMs: 'quicknav-window',
  quickNavLengthCue: 'quicknav-length-cue',
  quickNavPreviewWords: 'quicknav-preview-words',
  userName: 'user-name',
  assistantName: 'assistant-name',
  currency: 'currency',
  inrPerUsd: 'inr-per-usd',
};

/** Field id -> human label, for the spoken save-failure summary (ADR 0015). */
const FIELD_LABEL: Record<string, string> = {
  'selected-model': 'Selected model',
  'announcement-period': 'Announcement period',
  'read-whole': 'Read whole response on completion',
  'focus-on-completion': 'Focus on completion',
  'send-key': 'Send key mode',
  'quicknav-reads': 'Quick-nav single press reads',
  'quicknav-window': 'Quick-nav double-press window',
  'quicknav-length-cue': 'Quick-nav length cue position',
  'quicknav-preview-words': 'Quick-nav preview length (words)',
  'user-name': 'Your name',
  'assistant-name': 'Assistant name',
  currency: 'Currency',
  'inr-per-usd': 'INR per USD',
};

/**
 * Map one issue path to a field id, or null when it does not address a rendered field.
 *
 * A `['connections', i, field]` path returns null: the connection inputs live inside the inline
 * {@link ConnectionForm}, which validates the draft pre-submit, so a server connection issue falls
 * back to the global save-failure summary rather than a per-field message. Only top-level scalar
 * fields map to a rendered control here.
 *
 * @param path - The Zod issue path (e.g. `['announcementPeriodMs']`).
 * @returns The field id the path addresses, or null when no rendered field matches.
 */
function pathToFieldId(path: (string | number)[]): string | null {
  const top = path[0];
  return typeof top === 'string' ? (TOP_LEVEL_FIELD_ID[top] ?? null) : null;
}

/**
 * Build a field-id -> message map from a server validation-error `details` payload (an array of Zod
 * issues). First issue per field wins. Defensive: a non-array issue, an unmappable path, or a
 * non-string message yields no entry, so a malformed payload never throws and never speaks a
 * `[object Object]` summary - the global summary is the backstop.
 *
 * @param details - The `details` of an `ApiClientError` with code `validation-error` (Zod issues).
 * @returns A map of field id to its first error message; empty when nothing maps.
 */
export function fieldErrorsFromIssues(details: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(details)) return out;
  for (const issue of details as ValidationIssue[]) {
    if (!issue || !Array.isArray(issue.path) || typeof issue.message !== 'string') continue;
    const id = pathToFieldId(issue.path);
    if (id && !(id in out)) out[id] = issue.message;
  }
  return out;
}

/**
 * The spoken summary for a save failure (ADR 0015): "{label}: {message}" for exactly one mapped field,
 * "N fields need attention" for several, or `fallback` when nothing mapped.
 *
 * @param fieldErrors - The field-id -> message map from {@link fieldErrorsFromIssues}.
 * @param fallback - The message to speak when no field maps (the global summary).
 * @returns The single spoken summary line.
 */
export function summarizeSaveFailure(
  fieldErrors: Record<string, string>,
  fallback: string,
): string {
  const entries = Object.entries(fieldErrors);
  if (entries.length === 0) return fallback;
  if (entries.length > 1) return `${entries.length} fields need attention`;
  const [id, fieldMessage] = entries[0] as [string, string];
  const label = FIELD_LABEL[id] ?? id;
  return `${label}: ${fieldMessage}`;
}
