import { Hono } from 'hono';

import { makeApiError } from '@anvika/shared/errors';

import type { AssetSource } from './assets/asset-source';
import type {
  ActiveConversationStore,
  IdModelOverrideStore,
  IdReasoningOverrideStore,
  MultiConversationStore,
  SettingsStore,
} from './persistence/ports';

import { serverLogger } from './logging/logger';
import { createRequestLogging } from './middleware/request-logging';
import { createChatRoute } from './routes/chat';
import { createConnectionsRoute } from './routes/connections';
import { createConversationsRoute, type RetitleFn } from './routes/conversations';
import { createFxRateRoute } from './routes/fx-rate';
import { createHealthRoute } from './routes/health';
import { createLogRoute } from './routes/log';
import { createModelsRoute } from './routes/models';
import { createSettingsRoute } from './routes/settings';

/** Options for {@link createApp}. */
export interface CreateAppInput {
  /** Source of static web-client assets to serve, or undefined in tests/no-client builds. */
  assetSource: AssetSource | undefined;
  /** Whether to log message content (passed to the chat route; default decided at boot). */
  logContent: boolean;
  /**
   * The id-keyed multi-conversation store, satisfying all four ports
   * ({@link MultiConversationStore}, {@link IdReasoningOverrideStore}, {@link IdModelOverrideStore},
   * {@link ActiveConversationStore}).
   * Backs the conversations route and the chat route's id-keyed persistence, reasoning override,
   * and model override.
   */
  multiConversationStore: MultiConversationStore &
    IdReasoningOverrideStore &
    IdModelOverrideStore &
    ActiveConversationStore;
  /**
   * On-demand AI retitle function for the conversations route (it needs the settings-driven model
   * resolver, built at the composition root). Backs the `POST /:id/retitle` endpoint.
   */
  retitle: RetitleFn;
  /** The settings store, constructed at boot and injected. */
  settingsStore: SettingsStore;
  /** Resolved on-disk settings/secrets paths, surfaced to the client by the settings route. */
  settingsPaths: { settings: string; secrets: string };
  /** Whether the resolved global log level is `off` (passed to the log route for the off signal). */
  globalLogOff: boolean;
}

/**
 * Build the Hono application: API routes, canonical error handlers, and optional
 * static client serving. The injected id-keyed multi-conversation store is wired into both the
 * conversations route (list/load/rename/delete/reasoning override) and the chat route (so finished
 * turns persist by id and the per-conversation override feeds the effort cascade), and the injected
 * settings store is wired into the settings route (GET/PATCH).
 *
 * @param input - Configuration options including the asset source, the multi-conversation store,
 *   the retitle function, and the settings store.
 * @returns A configured {@link Hono} instance ready to serve requests.
 */
export function createApp(input: CreateAppInput): Hono {
  const app = new Hono();

  // Log every API request (method, path, status, duration) - never bodies (privacy rule).
  app.use('/api/*', createRequestLogging());

  app.route('/', createHealthRoute({ logContent: input.logContent }));
  app.route(
    '/',
    createLogRoute({ globalLogOff: input.globalLogOff, logContent: input.logContent }),
  );
  app.route(
    '/',
    createConversationsRoute({
      conversationStore: input.multiConversationStore,
      reasoningOverrideStore: input.multiConversationStore,
      modelOverrideStore: input.multiConversationStore,
      activeStore: input.multiConversationStore,
      retitle: input.retitle,
    }),
  );
  app.route(
    '/',
    createSettingsRoute({ settingsStore: input.settingsStore, paths: input.settingsPaths }),
  );
  app.route(
    '/',
    createFxRateRoute({ settingsStore: input.settingsStore, paths: input.settingsPaths }),
  );
  app.route('/', createModelsRoute({ settingsStore: input.settingsStore }));
  app.route('/', createConnectionsRoute({ settingsStore: input.settingsStore }));
  app.route(
    '/',
    createChatRoute({
      logContent: input.logContent,
      // The id-keyed store satisfies both the multi-conversation and id-reasoning-override ports;
      // pass it for both so a request carrying a conversationId persists by id and reads the
      // per-conversation override by id. An absent conversationId keeps the turn ephemeral.
      multiConversationStore: input.multiConversationStore,
      idReasoningOverrideStore: input.multiConversationStore,
      // The same composed store satisfies the id-model-override port too, so a request carrying a
      // conversationId reads its persisted model override by id (the authoritative per-turn model).
      idModelOverrideStore: input.multiConversationStore,
      // The same composed store also satisfies the active-pointer port: a persisted turn marks its
      // conversation active so a reload or restart restores the conversation the user just used.
      activeStore: input.multiConversationStore,
      settingsStore: input.settingsStore,
    }),
  );

  // Any unmatched /api route is a canonical not-found.
  app.all('/api/*', (c) => c.json(makeApiError('not-found', 'No such endpoint'), 404));

  // Unexpected errors become a canonical internal error.
  app.onError((err, c) => {
    serverLogger('http').error('unhandled error', { message: err.message });
    return c.json(makeApiError('internal', 'Unexpected server error'), 500);
  });

  // Serve the built client through the injected asset source (filesystem in source/dev,
  // embedded in the compiled binary). Keeping the lookup behind the port keeps this module
  // free of Bun path logic and free of mode branching.
  if (input.assetSource) {
    const source = input.assetSource;
    app.get('/*', async (c) => {
      const res = await source.resolve(new URL(c.req.url).pathname);
      return res ?? c.json(makeApiError('not-found', 'Not found'), 404);
    });
  }

  return app;
}
