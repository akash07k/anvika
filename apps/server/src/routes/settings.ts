import { Hono } from 'hono';

import { makeApiError } from '@anvika/shared/errors';
import { SettingsPatchSchema } from '@anvika/shared/settings/contracts';
import { redactSettingsPatch } from '@anvika/shared/settings/redactPatch';

import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { serverLogger } from '../logging/logger';
import { buildSettingsResponse } from '../settings/settings-response';
import { loadSettings, patchSettings } from '../settings/service';

/** Options for {@link createSettingsRoute}. */
export interface CreateSettingsRouteInput {
  /** The injected settings store (file-backed in production, a fake in tests). */
  settingsStore: SettingsStore;
  /** Resolved on-disk settings/secrets paths, surfaced to the client (no secret values). */
  paths: { settings: string; secrets: string };
}

/**
 * Build the `GET`/`PATCH /api/v1/settings` routes. `GET` returns `{ version, settings, recovered,
 * paths }` with secrets redacted to `{ isSet }` - the server is the sole holder of
 * plaintext, so secrets never cross this boundary; `recovered` is true when the on-disk file was
 * unreadable and defaults were substituted, and `paths` reveals where the files live. `PATCH` accepts
 * any JSON object, deep-merges it, re-validates the whole, saves, and returns the redacted result; an
 * invalid body or merged result is a canonical `validation-error` (400) and persists nothing. When the
 * on-disk file is invalid, a save is refused with `settings-file-invalid` (409) unless the request
 * carries `?overwriteInvalid=true` (an explicit user confirmation). Redaction is applied here at the
 * HTTP boundary; the service holds the plaintext.
 *
 * @param input - The injected settings store and resolved file paths.
 * @returns A Hono route exposing `GET`/`PATCH /api/v1/settings`.
 */
export function createSettingsRoute(input: CreateSettingsRouteInput): Hono {
  return new Hono()
    .get('/api/v1/settings', async (c) => {
      const { version, settings, recovered } = await loadSettings(input.settingsStore, OWNER_LOCAL);
      // Redact then validate the envelope on the way OUT (both directions).
      return c.json(buildSettingsResponse({ version, settings, recovered, paths: input.paths }));
    })
    .patch('/api/v1/settings', async (c) => {
      const body: unknown = await c.req.json().catch(() => null);
      const envelope = SettingsPatchSchema.safeParse(body);
      if (!envelope.success) {
        return c.json(makeApiError('validation-error', 'Settings patch must be an object'), 400);
      }
      const overwriteInvalid = c.req.query('overwriteInvalid') === 'true';
      const result = await patchSettings(input.settingsStore, OWNER_LOCAL, envelope.data, {
        overwriteInvalid,
      });
      if (!result.ok) {
        if (result.reason === 'file-invalid') {
          serverLogger('settings').warn('settings save refused; on-disk file invalid', {
            owner: OWNER_LOCAL,
          });
          return c.json(
            makeApiError(
              'settings-file-invalid',
              'The settings file on disk is invalid; overwrite it or fix it before saving.',
            ),
            409,
          );
        }
        return c.json(makeApiError('validation-error', 'Invalid settings', result.issues), 400);
      }
      // Log WHAT changed (the validated PATCH body) with secret and host fields redacted. Settings
      // values are configuration, not prompt/response content, so logging them is content-safe;
      // redactSettingsPatch strips connection apiKeys and header values AND the host config (baseUrl,
      // resourceName, apiVersion) so the never-log-base-URL rule (ADR 0023) holds here too. The PATCH
      // schema is a loose object, so an unexpected top-level key the client sent would also appear here
      // (redacted only if its name is a known secret/host field) - acceptable for the single-owner
      // settings surface; revisit if a free-text content field is ever added to settings.
      serverLogger('settings').info('Settings saved', {
        changed: redactSettingsPatch(envelope.data),
        overwroteInvalid: overwriteInvalid,
      });
      return c.json(
        buildSettingsResponse({
          version: result.version,
          settings: result.settings,
          recovered: false,
          paths: input.paths,
        }),
      );
    });
}
