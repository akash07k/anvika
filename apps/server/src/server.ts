import { join } from 'node:path';

import open from 'open';

import type { BootstrapConfig } from './config/bootstrap';
import { resolveDataDir } from './config/data-dir';
import { createApp } from './app';
import { createSettingsModelResolver } from './chat/resolve-model';
import { retitleConversation } from './chat/retitle';
import type { AssetSource } from './assets/asset-source';
import type { AnvikaDb } from './persistence/drizzle/connection';
import { openDatabase } from './persistence/drizzle/open-database';
import { DrizzleMultiConversationStore } from './persistence/drizzle/drizzle-multi-conversation-store';
import { FileSettingsStore } from './persistence/file/file-settings-store';
import { withSettingsStoreLogging } from './persistence/logging-store';
import { withMultiConversationStoreLogging } from './persistence/multi-conversation-logging-store';
import { maybeRefreshFxRateOnStartup } from './fx/refresh-fx-rate';
import { configureLogging } from './logging/setup';
import { installProcessErrorHandlers } from './logging/error-sinks';
import { serverLogger } from './logging/logger';
import { formatLogDateStamp, formatLogTimeStamp, sweepOldLogs } from './logging/retention';
import { buildServeOptions } from './serve-options';

/** Mode-specific dependencies injected into {@link startServer} by the entrypoint. */
export interface ServerDeps {
  /** Human-readable startup mode for the boot log (e.g. `source` or `embedded binary`). */
  description: string;
  /** The asset source for the web client, or undefined when no client is available. */
  assetSource: AssetSource | undefined;
  /** Apply database migrations (Drizzle folder migrator in source, embedded in the binary). */
  migrate: (db: AnvikaDb) => void;
  /** Default data directory (lowest precedence; resolved and created by resolveDataDir). */
  defaultDataDir: string;
}

/** Days of daily log files to retain before the startup sweep deletes them. */
const LOG_RETENTION_DAYS = 14;

/** How many ports above the requested one to probe when the user opts into a fallback. */
const MAX_PORT_PROBES = 64;

/**
 * Bind the app on `desiredPort`. If it is in use: when attached to an interactive
 * terminal, ask whether to use the next free port (default no) and exit on decline;
 * otherwise fail fast rather than prompt - a prompt would hang CI, the E2E test web
 * server, or a detached launch. An explicit `--port` is honoured by the caller.
 *
 * @param desiredPort - The TCP port to attempt first.
 * @param fetch - The Hono `app.fetch` handler to pass to `Bun.serve`.
 * @param log - Logger instance for the boot category.
 * @returns The running `Bun.Server` instance.
 */
function listenWithPortFallback(
  desiredPort: number,
  fetch: (request: Request) => Response | Promise<Response>,
  log: ReturnType<typeof serverLogger>,
): ReturnType<typeof Bun.serve> {
  const tryListen = (port: number): ReturnType<typeof Bun.serve> | undefined => {
    try {
      return Bun.serve(buildServeOptions(port, fetch));
    } catch (err) {
      const code =
        err instanceof Error && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'EADDRINUSE') return undefined;
      throw err;
    }
  };

  const first = tryListen(desiredPort);
  if (first) return first;

  const inUse = `Port ${desiredPort} is already in use. Stop the other process or run anvika serve --port <n>.`;

  if (!process.stdin.isTTY) {
    throw new Error(inUse);
  }
  if (!confirm(`Port ${desiredPort} is in use. Use the next available port instead?`)) {
    throw new Error(inUse);
  }

  for (let port = desiredPort + 1; port <= desiredPort + MAX_PORT_PROBES; port++) {
    const server = tryListen(port);
    if (server) {
      log.info('default port in use, using fallback port', { desiredPort, port });
      return server;
    }
  }
  throw new Error(
    `No free port found between ${desiredPort + 1} and ${desiredPort + MAX_PORT_PROBES}. Pass --port <n>.`,
  );
}

/**
 * Boot the server: resolve the data directory, configure logging, build the Hono app,
 * bind the port, and optionally open the browser.
 *
 * @param cfg - Fully resolved bootstrap configuration from {@link resolveBootstrapConfig}.
 * @param deps - Mode-specific dependencies injected by the entrypoint.
 */
export async function startServer(cfg: BootstrapConfig, deps: ServerDeps): Promise<void> {
  const dataDir = resolveDataDir({
    flag: cfg.dataDirFlag,
    env: cfg.dataDirEnv,
    defaultDir: deps.defaultDataDir,
  });
  const now = new Date();
  await configureLogging({
    dataDir,
    level: cfg.log.level,
    categories: cfg.log.categories,
    dateStamp: formatLogDateStamp(now),
    timeStamp: formatLogTimeStamp(now),
    pid: process.pid,
    debug: cfg.log.level === 'debug' || cfg.log.level === 'trace',
  });
  installProcessErrorHandlers();
  const log = serverLogger('boot');
  log.info('startup mode', { mode: deps.description });

  if (cfg.logContent) {
    log.warn(
      'content logging is ON - logs contain message text; do not enable in a shared or public deployment',
    );
  }

  await sweepOldLogs({
    dir: join(dataDir, 'logs'),
    retentionDays: LOG_RETENTION_DAYS,
    now: new Date(),
  }).catch((err: unknown) => {
    log.warn('log retention sweep failed', { error: String(err) });
  });

  const db = openDatabase(dataDir);
  deps.migrate(db);
  // Positive outcome log so a successful migrate is visible, not just failures.
  log.info('database ready');
  // The id-keyed store over the db, satisfying all three ports. Wrapped in a
  // content-safe logging decorator that logs load and saveTurn outcomes without double-logging the
  // route-level mutations (rename/delete/deleteMany/setActive/setReasoningOverride).
  const rawMultiConversationStore = new DrizzleMultiConversationStore(db);
  const multiConversationStore = withMultiConversationStoreLogging(rawMultiConversationStore);
  const fileSettingsStore = new FileSettingsStore(dataDir);
  const settingsStore = withSettingsStoreLogging(fileSettingsStore);

  // The on-demand AI retitle function reuses the SAME settings-driven model resolver the chat route
  // builds, so a regenerated title resolves the configured model and surfaces `unconfigured` the same
  // way; the route supplies the conversation's messages per call.
  const resolveModel = createSettingsModelResolver({ settingsStore });
  const retitle = (messages: Parameters<typeof retitleConversation>[0]['messages']) =>
    retitleConversation({ resolveModel, messages });

  const app = createApp({
    assetSource: deps.assetSource,
    logContent: cfg.logContent,
    multiConversationStore,
    retitle,
    settingsStore,
    settingsPaths: fileSettingsStore.paths,
    globalLogOff: cfg.log.level === 'off',
  });

  // Best-effort: if the user opted into auto-refresh and the rate is stale, refresh it in the
  // background. Not awaited, and a failure is swallowed, so it never delays or fails boot.
  void maybeRefreshFxRateOnStartup(settingsStore).catch((err: unknown) => {
    serverLogger('fx').warn('startup FX refresh threw', { error: String(err) });
  });

  const server = listenWithPortFallback(cfg.port, app.fetch, log);
  const url = `http://127.0.0.1:${server.port}/`;
  log.info('server listening', { url, dataDir });

  if (cfg.open) {
    await open(url).catch(() => log.warn('could not open browser', { url }));
  }
}
