import { z } from 'zod';

import { RedactedSettingsSchema } from './redacted';

/** Resolved on-disk locations of the settings files (shown in the UI; no secrets). */
export const SettingsPathsSchema = z.object({ settings: z.string(), secrets: z.string() });

/** Resolved settings file paths. */
export type SettingsPaths = z.infer<typeof SettingsPathsSchema>;

/**
 * Response body for `GET`/`PATCH /api/v1/settings`: the schema `version` plus the
 * redacted settings object. `settings` is FULLY validated here against {@link RedactedSettingsSchema}
 * (strict ZOD validation everywhere): a leaked plaintext secret in the response is rejected, not
 * blindly accepted, and the client gets a precisely-typed `RedactedSettings` with no downstream cast.
 *
 * `recovered` and `paths` were added when settings moved to JSON files (ADR 0019). They are
 * deliberately TOLERANT - `recovered` defaults to `false` and `paths` is optional - so older client
 * fixtures that predate these fields still parse this envelope unchanged.
 */
export const SettingsResponseSchema = z.object({
  version: z.int(),
  settings: RedactedSettingsSchema,
  /** True when stored settings were unreadable and defaults were substituted. */
  recovered: z.boolean().default(false),
  /** Where the settings/secrets files live on disk (absent on legacy responses). */
  paths: SettingsPathsSchema.optional(),
});

/** A validated settings response envelope. */
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

/**
 * Request body for `PATCH /api/v1/settings`: any JSON object (a partial, deeply-nested update). It is
 * deliberately loose - `z.looseObject` PASSES unknown keys through (a plain `z.object({})` would strip
 * them and the merge would no-op). The real guarantee is the post-merge re-validation of the whole
 * settings object against `SettingsSchema`; this boundary only rejects non-objects.
 */
// DELIBERATE: looseObject (not a strict/typed object) is intentional here. A strict object would
// STRIP unknown keys and the deep-merge would silently no-op; the real guarantee is the post-merge
// SettingsSchema re-validation. Do not tighten this to a typed schema.
export const SettingsPatchSchema = z.looseObject({});

/** A validated (shallow) settings PATCH body. */
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;
