// packages/shared/src/settings/redacted.ts
import { z } from 'zod';

import {
  azureObject,
  azureRefinement,
  azureRefineOptions,
  nativeKeyType,
  NATIVE_KEY_TYPES,
  openaiCompatibleObject,
} from './connection';
import { SettingsSchema } from './schema';

/**
 * The redacted indicator that replaces a secret field on the public wire: it reports ONLY whether a
 * value is stored, never the value. This is the single shape any secret collapses to before it
 * crosses the HTTP boundary.
 */
export const IsSetSchema = z.object({ isSet: z.boolean() });

/** The redacted indicator `{ isSet }` (derived from {@link IsSetSchema}; never carries the value). */
export type IsSet = z.infer<typeof IsSetSchema>;

/**
 * Build a native-key variant's REDACTED object: identical to the plaintext variant
 * ({@link nativeKeyType}) except `apiKey` collapses to {@link IsSetSchema}. Derived from the source
 * object via `.omit().extend()` so the two cannot drift on the non-secret fields. Strict (rejects
 * unexpected keys) for defense-in-depth.
 *
 * @param type - The native-key connection type literal for this variant.
 * @returns The redacted object schema for that native-key connection type.
 */
function redactedNativeKeyType<T extends (typeof NATIVE_KEY_TYPES)[number]>(type: T) {
  return nativeKeyType(type)
    .omit({ apiKey: true })
    .extend({ apiKey: IsSetSchema.optional() })
    .strict();
}

/** The redacted azure object: same base as the plaintext azure, `apiKey` collapsed to `{ isSet }`. */
const redactedAzureObject = azureObject
  .omit({ apiKey: true })
  .extend({ apiKey: IsSetSchema.optional() })
  .strict();

/**
 * The redacted openai-compatible object: same base as the plaintext, `apiKey` collapsed to
 * `{ isSet }` and each `headers` VALUE collapsed to `{ isSet }`. Strict (rejects unexpected keys) for
 * defense-in-depth, matching its siblings. `.strict()` governs only this object's OWN declared keys
 * (id, type, label, baseUrl, apiKey, headers, ...); it does NOT touch the nested `headers` record,
 * whose user-supplied key NAMES remain unconstrained by `z.record`.
 */
const redactedOpenaiCompatibleObject = openaiCompatibleObject
  .omit({ apiKey: true, headers: true })
  .extend({
    apiKey: IsSetSchema.optional(),
    headers: z.record(z.string(), IsSetSchema).optional(),
  })
  .strict();

/**
 * A redacted connection: the seven-variant discriminated union mirroring `ConnectionSchema`, but with
 * every secret field collapsed to {@link IsSetSchema}. Every variant is DERIVED from the same source
 * object as its plaintext counterpart (via `.omit().extend()`), so the non-secret fields cannot
 * drift; only the secret fields differ. This is the only connection shape that crosses the GET
 * boundary.
 */
export const RedactedConnectionSchema = z.discriminatedUnion('type', [
  redactedNativeKeyType('anthropic'),
  redactedNativeKeyType('openai'),
  redactedNativeKeyType('google'),
  redactedNativeKeyType('openrouter'),
  redactedNativeKeyType('xai'),
  redactedAzureObject.refine(azureRefinement, azureRefineOptions),
  redactedOpenaiCompatibleObject,
]);

/**
 * The settings shape returned by `GET`/`PATCH /api/v1/settings`: every scalar field and
 * `hotkeyBindings` reused VERBATIM from {@link SettingsSchema} (no duplication, no drift), with
 * `connections` swapped for the redacted variant. This fully validates the redacted envelope on the
 * client; no blind cast is needed downstream.
 */
export const RedactedSettingsSchema = SettingsSchema.omit({ connections: true }).extend({
  connections: z.array(RedactedConnectionSchema),
});
