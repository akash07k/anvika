import { SettingsResponseSchema, type SettingsResponse } from '@anvika/shared/settings/contracts';
import { redactSecrets } from '@anvika/shared/settings/redact';
import type { Settings } from '@anvika/shared/settings/schema';

/** Inputs for {@link buildSettingsResponse}. */
export interface BuildSettingsResponseInput {
  /** The settings schema version the row conforms to. */
  version: number;
  /** The PLAINTEXT settings to redact and return; secret leaves are collapsed to `{ isSet }`. */
  settings: Settings;
  /** True when stored settings were unreadable and defaults were substituted. */
  recovered: boolean;
  /** Resolved on-disk file paths to surface (omitted on the connection secret-update echo). */
  paths?: { settings: string; secrets: string };
}

/**
 * Assemble the validated `{ version, settings, recovered, paths? }` envelope shared by every
 * settings-bearing endpoint (GET and PATCH `/settings`, the connection secret-update echo, and the
 * FX-rate refresh). Redaction runs BEFORE the schema parse, and the parse is the both-direction
 * trust-boundary guard: a leaked plaintext secret fails `SettingsResponseSchema` rather
 * than crossing the wire. Centralizing the redact-then-validate step here means a new
 * settings-bearing route cannot forget it.
 *
 * @param input - The version, plaintext settings, recovered flag, and optional file paths.
 * @returns The redacted, validated settings response envelope.
 */
export function buildSettingsResponse(input: BuildSettingsResponseInput): SettingsResponse {
  return SettingsResponseSchema.parse({
    version: input.version,
    settings: redactSecrets(input.settings),
    recovered: input.recovered,
    ...(input.paths ? { paths: input.paths } : {}),
  });
}
