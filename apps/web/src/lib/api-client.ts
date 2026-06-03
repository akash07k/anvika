import { ApiErrorSchema, type ApiErrorCode } from '@anvika/shared/errors';
import type { ZodType } from 'zod';

/** Error thrown by the API client when the server returns a canonical error. */
export class ApiClientError extends Error {
  /** The canonical error code returned by the server. */
  readonly code: ApiErrorCode;
  /** Optional extra context attached to the error. */
  readonly details: unknown;

  /**
   * Construct a typed API client error.
   *
   * @param code - The canonical {@link ApiErrorCode} from the server.
   * @param message - Human-readable error message.
   * @param details - Optional extra context (field list, provider message, etc.).
   */
  constructor(code: ApiErrorCode, message: string, details: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Throw a typed {@link ApiClientError} for a non-ok response. Parses the
 * canonical {@link ApiErrorSchema} when present; otherwise throws a synthetic
 * `internal` error carrying the HTTP status.
 *
 * @param res - The non-ok fetch {@link Response}.
 * @throws ApiClientError Always.
 */
async function throwCanonicalError(res: Response): Promise<never> {
  const json: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const parsed = ApiErrorSchema.safeParse(json);
  if (parsed.success) {
    throw new ApiClientError(parsed.data.code, parsed.data.message, parsed.data.details);
  }
  throw new ApiClientError('internal', `Request failed with status ${res.status}`, undefined);
}

/**
 * Validate an ok response body against `schema`, throwing a `validation-error`
 * {@link ApiClientError} when the body does not match.
 *
 * @param res - The ok fetch {@link Response}.
 * @param schema - The Zod schema the body must satisfy.
 * @returns The validated body typed as `T`.
 * @throws ApiClientError With code `validation-error` on a malformed body.
 */
async function parseOk<T>(res: Response, schema: ZodType<T>): Promise<T> {
  const json: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('validation-error', 'Malformed server response', parsed.error.issues);
  }
  return parsed.data;
}

/**
 * GET a JSON endpoint and validate the success body against `schema`,
 * throwing {@link ApiClientError} on failure or a malformed body.
 *
 * @param path - The request path (e.g. `/api/v1/health`).
 * @param schema - The Zod schema the success body must satisfy.
 * @returns The validated JSON body typed as `T`.
 * @throws ApiClientError On a non-ok response or a malformed success body.
 */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  if (!res.ok) await throwCanonicalError(res);
  return parseOk(res, schema);
}

/**
 * POST JSON to an endpoint, throwing {@link ApiClientError} on failure.
 *
 * When `schema` is omitted or the server returns 204, no body is validated and
 * `undefined` is returned. Otherwise the success body is validated against
 * `schema`.
 *
 * @param path - The request path (e.g. `/api/v1/log`).
 * @param body - The JSON-serializable request body.
 * @param schema - Optional Zod schema the success body must satisfy.
 * @param signal - Optional {@link AbortSignal} to cancel the request (e.g. a timeout ceiling).
 * @returns The validated JSON body typed as `T`, or `undefined` when no body is expected.
 * @throws ApiClientError On a non-ok response or a malformed success body.
 */
export async function apiPost<T>(
  path: string,
  body: unknown,
  schema?: ZodType<T>,
  signal?: AbortSignal,
): Promise<T | undefined> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) await throwCanonicalError(res);
  if (res.status === 204 || schema === undefined) return undefined;
  return parseOk(res, schema);
}

/**
 * PUT JSON to an endpoint, throwing {@link ApiClientError} on failure.
 *
 * When `schema` is omitted or the server returns 204, no body is validated and
 * `undefined` is returned. Otherwise the success body is validated against
 * `schema`.
 *
 * @param path - The request path (e.g. `/api/v1/connections/:id/secret`).
 * @param body - The JSON-serializable request body.
 * @param schema - Optional Zod schema the success body must satisfy.
 * @returns The validated JSON body typed as `T`, or `undefined` when no body is expected.
 * @throws ApiClientError On a non-ok response or a malformed success body.
 */
export async function apiPut<T>(
  path: string,
  body: unknown,
  schema?: ZodType<T>,
): Promise<T | undefined> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwCanonicalError(res);
  if (res.status === 204 || schema === undefined) return undefined;
  return parseOk(res, schema);
}

/**
 * PATCH JSON to an endpoint and validate the success body against `schema`, throwing
 * {@link ApiClientError} on a non-ok response or a malformed body.
 *
 * @param path - The request path (e.g. `/api/v1/settings`).
 * @param body - The JSON-serializable partial update.
 * @param schema - The Zod schema the success body must satisfy.
 * @returns The validated JSON body typed as `T`.
 * @throws ApiClientError On a non-ok response or a malformed success body.
 */
export async function apiPatch<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwCanonicalError(res);
  return parseOk(res, schema);
}

/**
 * PATCH JSON to an endpoint that returns no body (204), throwing {@link ApiClientError}
 * on a non-ok response. Unlike {@link apiPatch}, this tolerates an empty success body and
 * never validates one - use it for PATCH routes whose contract is 204 (e.g. rename).
 *
 * @param path - The request path (e.g. `/api/v1/conversations/:id`).
 * @param body - The JSON-serializable request body.
 * @throws ApiClientError On a non-ok response.
 */
export async function apiPatchNoContent(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwCanonicalError(res);
}

/**
 * DELETE a JSON endpoint, throwing {@link ApiClientError} on failure.
 *
 * When `schema` is omitted or the server returns 204, no body is validated and
 * `undefined` is returned. Otherwise the success body is validated against `schema`.
 *
 * @param path - The request path (e.g. `/api/v1/conversations/:id`).
 * @param schema - Optional Zod schema the success body must satisfy.
 * @returns The validated JSON body typed as `T`, or `undefined` when no body is expected.
 * @throws ApiClientError On a non-ok response or a malformed success body.
 */
export async function apiDelete<T>(path: string, schema?: ZodType<T>): Promise<T | undefined> {
  const res = await fetch(path, { method: 'DELETE', headers: { accept: 'application/json' } });
  if (!res.ok) await throwCanonicalError(res);
  if (res.status === 204 || schema === undefined) return undefined;
  return parseOk(res, schema);
}
