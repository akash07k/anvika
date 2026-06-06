// packages/shared/src/settings/connection.ts
import { z } from 'zod';

import { ReasoningEffortOverrideSchema } from '../reasoning/effort';

/** The seven connection types. `openai-compatible` is the catch-all for arbitrary endpoints. */
export const CONNECTION_TYPES = [
  'anthropic',
  'openai',
  'google',
  'azure',
  'openrouter',
  'xai',
  'openai-compatible',
] as const;

/** A connection type id. */
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

/**
 * The connection id schema: non-empty, lowercase slug (letters, digits, hyphens only). Colon-free
 * so it can serve as the model-id namespace prefix without ambiguity.
 *
 * Exported for use at API boundaries (e.g. route param validation) so the same rule is enforced
 * consistently across the stack without duplication.
 */
export const ConnectionIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/, 'id must be lowercase letters, digits, and hyphens')
  .meta({ label: 'Connection id', category: 'connections' });

/** The inferred TypeScript type for a validated connection id. */
export type ConnectionId = z.infer<typeof ConnectionIdSchema>;

/** @internal Alias kept for use in {@link commonFields} below. */
const idField = ConnectionIdSchema;

/** A write-only secret API key (the `secret` meta flag drives partition/redaction). */
const apiKeyField = z
  .string()
  .min(1)
  .optional()
  .meta({ secret: true, label: 'API key', uiHint: 'secret', category: 'connections' });

/** Fields shared by every connection type. */
const commonFields = {
  id: idField,
  label: z.string().min(1).max(60).meta({ label: 'Label', category: 'connections' }),
  enabled: z.boolean().default(true).meta({
    label: 'Active',
    description:
      'When off, this connection is muted: excluded from model discovery and the picker, but kept with its key.',
    category: 'connections',
  }),
  manualModelIds: z.array(z.string().min(1)).optional(),
  reasoningEffort: ReasoningEffortOverrideSchema.default('inherit').meta({
    label: 'Thinking effort',
    description:
      'Override the global thinking effort for this connection. Inherit uses the global setting.',
    category: 'connections',
  }),
};

/**
 * The four native-key connection types (key + optional base-URL override). These plus `azure` and
 * `openai-compatible` form the seven-variant union. Exported so the redacted union ({@link
 * ./redacted}) derives its variants from the SAME source shapes (no drift).
 */
export const NATIVE_KEY_TYPES = ['anthropic', 'openai', 'google', 'openrouter', 'xai'] as const;

/**
 * Build a native key-based variant's object shape (no apiKey/headers handling beyond the field
 * itself). Returns a plain `z.object` so callers can `.omit`/`.extend` it (e.g. the redacted union).
 *
 * @param type - The connection type literal for this variant.
 * @returns The plaintext object schema for a native-key connection of that type.
 */
export function nativeKeyType<T extends (typeof NATIVE_KEY_TYPES)[number]>(type: T) {
  return z.object({
    ...commonFields,
    type: z.literal(type),
    apiKey: apiKeyField,
    baseUrl: z.url().optional(),
  });
}

/**
 * The azure variant's object shape BEFORE its `resourceName || baseUrl` refinement. Exported so the
 * redacted union builds its azure variant from the same base (only `apiKey` differs).
 */
export const azureObject = z.object({
  ...commonFields,
  type: z.literal('azure'),
  apiKey: apiKeyField,
  resourceName: z.string().min(1).optional().meta({ label: 'Azure resource name' }),
  baseUrl: z.url().optional(),
  apiVersion: z.string().min(1).optional().meta({ label: 'Azure API version' }),
});

/** The azure invariant: a resource name OR an explicit base URL must be present. */
export const azureRefinement = (c: {
  resourceName?: string | undefined;
  baseUrl?: string | undefined;
}): boolean => Boolean(c.resourceName) || Boolean(c.baseUrl);

/** Shared options for {@link azureRefinement} so the plaintext and redacted variants match exactly. */
export const azureRefineOptions: { message: string; path: PropertyKey[] } = {
  message: 'azure requires resourceName or baseUrl',
  path: ['resourceName'],
};

/**
 * The openai-compatible variant's object shape (plaintext). Exported so the redacted union derives
 * its openai-compatible variant from the same base (only `apiKey` and `headers` values differ).
 */
export const openaiCompatibleObject = z.object({
  ...commonFields,
  type: z.literal('openai-compatible'),
  baseUrl: z.url().meta({ label: 'Base URL', category: 'connections' }),
  apiKey: apiKeyField,
  headers: z.record(z.string().min(1), z.string()).optional(),
  sendThinkingParams: z.boolean().default(true).meta({
    label: 'Send extended thinking parameters',
    description:
      'Send chat_template_kwargs.enable_thinking to turn on model thinking. Turn this off only if your local server rejects unknown request fields.',
    category: 'connections',
  }),
});

/**
 * The connection discriminated union. Each variant enforces exactly its type's
 * required fields. `azure` requires `resourceName` OR `baseUrl`; `openai-compatible` requires
 * `baseUrl` and may carry secret header VALUES (handled specially by partition/redact, since Zod
 * record metadata cannot mark per-key secrets).
 */
export const ConnectionSchema = z.discriminatedUnion('type', [
  nativeKeyType('anthropic'),
  nativeKeyType('openai'),
  nativeKeyType('google'),
  nativeKeyType('openrouter'),
  nativeKeyType('xai'),
  azureObject.refine(azureRefinement, azureRefineOptions),
  openaiCompatibleObject,
]);

/** A validated connection (plaintext secrets; server-only). */
export type Connection = z.infer<typeof ConnectionSchema>;

/**
 * The connections array: each element a valid {@link ConnectionSchema}, ids unique across the array,
 * defaulting to an empty array. Uniqueness is enforced here (not on the element) because it is a
 * cross-element invariant.
 */
export const ConnectionsSchema = z
  .array(ConnectionSchema)
  .default([])
  .superRefine((connections, ctx) => {
    const seen = new Set<string>();
    connections.forEach((c, i) => {
      if (seen.has(c.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate connection id "${c.id}"`,
          path: [i, 'id'],
        });
      }
      seen.add(c.id);
    });
  });

/** The validated connections array. */
export type Connections = z.infer<typeof ConnectionsSchema>;

/**
 * A connection as it appears on the PUBLIC wire (GET redacted non-secret part + PATCH body): the full
 * connection minus its secret fields. Secrets (`apiKey`, header values) never ride the connections
 * array; they are managed out of band via `PUT /api/v1/connections/:id/secret`.
 */
export type PublicConnection = Omit<Connection, 'apiKey' | 'headers'>;
