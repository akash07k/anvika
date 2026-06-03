import { Hono } from 'hono';

import { HealthResponseSchema } from '@anvika/shared/health';
import { APP_VERSION } from '@anvika/shared/version';

/** Options for {@link createHealthRoute}. */
export interface CreateHealthRouteInput {
  /** Whether content logging is enabled; surfaced to the client runtime-config. */
  logContent: boolean;
}

/**
 * Build the health endpoint used by the client (runtime-config), the boot smoke test, and the e2e
 * readiness probe. Carries server runtime metadata: the app version and the content-logging state.
 *
 * @param input - Whether content logging is enabled.
 * @returns A {@link Hono} app exposing `GET /api/v1/health`.
 */
export function createHealthRoute(input: CreateHealthRouteInput) {
  return new Hono().get('/api/v1/health', (c) =>
    // Validate the response on the way OUT too (both-direction trust-boundary rule).
    c.json(
      HealthResponseSchema.parse({
        status: 'ok',
        version: APP_VERSION,
        logContent: input.logContent,
      }),
    ),
  );
}
