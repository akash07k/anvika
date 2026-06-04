import { z } from 'zod';

/** The fixed set of error codes returned by /api/v1. */
export const API_ERROR_CODES = [
  'validation-error',
  'not-found',
  'conflict',
  'unconfigured',
  'provider-error',
  'internal',
  'settings-file-invalid',
  'fx-refresh-failed',
] as const;

/** Zod schema for a valid API error code. */
export const ApiErrorCodeSchema = z.enum(API_ERROR_CODES);

/** A valid API error code string. */
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** Canonical error shape for every non-2xx /api/v1 response. */
export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});

/** The validated canonical API error type. */
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Build a canonical API error object.
 *
 * @param code - One of the fixed {@link API_ERROR_CODES}.
 * @param message - Human-readable description of the error.
 * @param details - Optional extra context (provider message, field list, etc.).
 * @returns A plain {@link ApiError} object ready to serialize as JSON.
 */
export function makeApiError(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined ? { code, message } : { code, message, details };
}
