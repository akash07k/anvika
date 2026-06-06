import { z } from 'zod';

import { ConnectionSchema } from '../settings/connection';

/**
 * A secret-patch for a connection: set a value with a string, CLEAR it with `null`, or LEAVE it
 * unchanged by omitting the field/key. Used both by `PUT /api/v1/connections/:id/secret` (the only
 * secret-write channel) and as a test `override` applied on top of a stored connection before probing.
 */
export const SetConnectionSecretSchema = z.object({
  apiKey: z.string().min(1).nullable().optional(),
  headers: z.record(z.string().min(1), z.string().min(1).nullable()).optional(),
});

/** A connection secret-patch (set/clear/keep per field). */
export type SetConnectionSecret = z.infer<typeof SetConnectionSecretSchema>;

/**
 * A non-secret probe-config override applied over a stored connection before a by-id test, so a Test
 * reflects unsaved baseUrl/resourceName/apiVersion edits without the client holding the key. These
 * fields are public (already on the connections wire); only fields present are overlaid server-side.
 */
export const TestConfigOverrideSchema = z.object({
  baseUrl: z.string().optional(),
  resourceName: z.string().optional(),
  apiVersion: z.string().optional(),
});

/** A non-secret probe-config override (set per field, keep on omission). */
export type TestConfigOverride = z.infer<typeof TestConfigOverrideSchema>;

/**
 * A test-connection request: a full (possibly unsaved) config to probe directly, or a saved
 * connection by id with an optional secret `override` AND an optional non-secret `config` override
 * applied on top of the stored connection before probing - so an edited connection tests its re-typed
 * key / changed headers and its unsaved baseUrl/resourceName/apiVersion edits, all without the client
 * ever holding the untouched stored secrets. The config is overlaid first, then the secret.
 */
export const TestConnectionRequestSchema = z.union([
  z.object({ connection: ConnectionSchema }),
  z.object({
    connectionId: z.string().min(1),
    override: SetConnectionSecretSchema.optional(),
    config: TestConfigOverrideSchema.optional(),
  }),
]);

/** The request type. */
export type TestConnectionRequest = z.infer<typeof TestConnectionRequestSchema>;

/** The content-safe error category for a failed test. */
export const TestConnectionErrorCode = z.enum([
  'unauthorized',
  'unreachable',
  'bad-config',
  'unknown',
]);

/** A content-safe test-connection result: ok with a model count, or a categorized error. */
export const TestConnectionResponseSchema = z.object({
  ok: z.boolean(),
  modelCount: z.int().nonnegative().optional(),
  error: z.object({ code: TestConnectionErrorCode, message: z.string() }).optional(),
});

/** The response type. */
export type TestConnectionResponse = z.infer<typeof TestConnectionResponseSchema>;
