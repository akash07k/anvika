import type { ConnectionDraft } from './connectionDraft';
import { validateDraft } from './connectionDraft';

/**
 * Human-readable, content-safe labels for the public-connection fields a draft can fail validation
 * on. Keyed by the Zod issue path's first segment. Used to name the failing field(s) without echoing
 * any typed value (never a secret, base URL, or header value).
 */
const FIELD_LABELS: Record<string, string> = {
  id: 'Connection id',
  label: 'Label',
  baseUrl: 'Base URL',
  resourceName: 'Azure resource name',
  apiVersion: 'API version',
  type: 'Type',
};

/**
 * Validate a draft and, on failure, derive a content-safe summary of the failing fields. Returns
 * `null` when the draft is valid. The message names fields by their visible labels only - it never
 * includes a typed value, so it is safe to announce and to render as `aria-describedby` text.
 *
 * @param draft - The editable draft to validate.
 * @returns A content-safe error summary, or `null` when the draft passes validation.
 */
export function draftValidationError(draft: ConnectionDraft): string | null {
  const result = validateDraft(draft);
  if (result.success) return null;
  const fields = new Set<string>();
  for (const issue of result.error.issues) {
    const key = typeof issue.path[0] === 'string' ? issue.path[0] : '';
    fields.add(FIELD_LABELS[key] ?? 'one or more required fields');
  }
  const list = Array.from(fields).join(', ');
  return `Cannot save connection: please check ${list}.`;
}
