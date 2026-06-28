import { Hono } from 'hono';

import {
  SetConnectionSecretSchema,
  TestConnectionRequestSchema,
  TestConnectionResponseSchema,
} from '@anvika/shared/connections/contracts';
import { makeApiError } from '@anvika/shared/errors';
import { ConnectionIdSchema } from '@anvika/shared/settings/connection';

import { serverLogger } from '../logging/logger';
import type { FetchImpl } from '../models/discovery/shared';
import { OWNER_LOCAL } from '../persistence/owner';
import type { SettingsStore } from '../persistence/ports';
import { setConnectionSecret } from '../connections/secret-service';
import { testConnection } from '../connections/test-service';
import { buildSettingsResponse } from '../settings/settings-response';
import { loadSettings } from '../settings/service';

/** Options for {@link createConnectionsRoute}. */
export interface CreateConnectionsRouteInput {
  /** The injected settings store (to resolve a saved connection by id). */
  settingsStore: SettingsStore;
  /** Optional injected probe deps (tests supply a fake fetch); production uses the global fetch. */
  testDeps?: { fetchImpl?: FetchImpl; timeoutMs?: number };
}

/**
 * Build `POST /api/v1/connections/test`: validate the request (a saved id or a full config), run the
 * content-safe probe, and return the categorized result. Logs only the outcome (ok + error category) -
 * never the key, headers, base URL, or any response body.
 *
 * Also builds `PUT /api/v1/connections/:id/secret`: the only channel that writes a connection's
 * secrets. The body is a secret-patch (set/clear/keep per field); on success it returns the redacted
 * settings envelope (so no secret crosses the boundary). Logs only the connection id and outcome -
 * never the secret, header values, or body.
 *
 * @param input - The injected settings store and optional probe deps.
 * @returns A Hono route exposing the test and secret-update endpoints.
 */
export function createConnectionsRoute(input: CreateConnectionsRouteInput): Hono {
  return new Hono()
    .post('/api/v1/connections/test', async (c) => {
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = TestConnectionRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(makeApiError('validation-error', 'Invalid test-connection request'), 400);
      }
      const { settings } = await loadSettings(input.settingsStore, OWNER_LOCAL);
      const result = await testConnection(parsed.data, { settings, ...input.testDeps });
      serverLogger('connections').info('Connection tested', {
        ok: result.ok,
        ...(result.error ? { code: result.error.code } : {}),
      });
      // Validate the response on the way OUT too (both-direction rule).
      return c.json(TestConnectionResponseSchema.parse(result));
    })
    .put('/api/v1/connections/:id/secret', async (c) => {
      const id = c.req.param('id');
      const idCheck = ConnectionIdSchema.safeParse(id);
      if (!idCheck.success) {
        return c.json(makeApiError('validation-error', 'Invalid connection id'), 400);
      }
      const body: unknown = await c.req.json().catch(() => null);
      const parsed = SetConnectionSecretSchema.safeParse(body);
      if (!parsed.success) {
        return c.json(makeApiError('validation-error', 'Invalid connection secret'), 400);
      }
      const result = await setConnectionSecret(input.settingsStore, OWNER_LOCAL, id, parsed.data);
      if (!result.ok && result.reason === 'not-found') {
        serverLogger('connections').warn('connection secret update for unknown id', { id });
        return c.json(makeApiError('not-found', 'Connection not found'), 404);
      }
      if (!result.ok) {
        serverLogger('connections').warn('connection secret update failed validation', { id });
        return c.json(
          makeApiError('validation-error', 'Invalid connection secret', result.issues),
          400,
        );
      }
      serverLogger('connections').info('Connection secret updated', { id });
      // Redact then validate the envelope on the way OUT (both directions): the schema
      // rejects a leaked plaintext secret rather than letting it cross this secret-bearing boundary.
      return c.json(
        buildSettingsResponse({
          version: result.version,
          settings: result.settings,
          recovered: false,
        }),
      );
    });
}
