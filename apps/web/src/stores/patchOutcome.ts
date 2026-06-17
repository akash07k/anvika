import { ApiClientError } from '../lib/api-client';
import { fieldErrorsFromIssues, summarizeSaveFailure } from '../lib/settingsFieldErrors';

/**
 * The classification of a caught settings-PATCH error, for the store to apply side effects from.
 *
 * - `file-invalid`: the on-disk settings file is invalid - the store must revert and arm the
 *   overwrite prompt rather than record a save failure.
 * - `save-failed`: any other failure - the store records `message`, sets `fieldErrors` (per-field
 *   validation messages, empty when none mapped), and speaks `spokenSummary` once.
 */
export type PatchOutcome =
  | { kind: 'file-invalid' }
  | {
      kind: 'save-failed';
      fieldErrors: Record<string, string>;
      message: string;
      spokenSummary: string;
    };

/**
 * Classify a caught settings-PATCH error into the outcome the store acts on, with no side effects.
 *
 * A `settings-file-invalid` {@link ApiClientError} maps to `file-invalid`. A `validation-error`
 * carries Zod issues as `details`, mapped to per-field messages (ADR 0015); any other failure has no
 * field map, so the global summary is the only detail. `spokenSummary` is the single line the
 * notifier speaks ("{label}: {message}", "N fields need attention", or the fallback message).
 *
 * @param err - The error thrown by the PATCH (an {@link ApiClientError} or any other value).
 * @returns The classified outcome for the store to apply.
 */
export function classifyPatchError(err: unknown): PatchOutcome {
  if (err instanceof ApiClientError && err.code === 'settings-file-invalid') {
    return { kind: 'file-invalid' };
  }
  const fieldErrors =
    err instanceof ApiClientError && err.code === 'validation-error'
      ? fieldErrorsFromIssues(err.details)
      : {};
  const message = err instanceof Error ? err.message : 'Could not save settings';
  return {
    kind: 'save-failed',
    fieldErrors,
    message,
    spokenSummary: summarizeSaveFailure(fieldErrors, message),
  };
}
