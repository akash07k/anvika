import path from 'node:path';
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

const PORT = 7820;
/** Repo root - two levels above this config file (tests/e2e/). */
const ROOT = path.resolve(import.meta.dirname, '..', '..');

// Load the repo-root .env so the Playwright runner and its workers see ANVIKA_* vars
// (e.g. the Azure creds the live chat e2e gates on). Bun auto-loads .env for the server
// process it spawns, but not for the Node-based test runner, so the live test would
// otherwise skip even when .env is present. No-op when the file is absent, so CI stays green.
dotenv.config({ path: path.resolve(ROOT, '.env'), quiet: true });

export default defineConfig({
  testDir: '.',
  // Run serially. Each spec resets state via beforeEach(resetState), so specs no longer bleed
  // into each other. Serial execution is still required because: (1) all specs share a single
  // webServer instance bound to one port and one "local" owner's SQLite file - concurrent workers
  // would race the same HTTP server; (2) the live-Azure specs (chat-live, usage-metadata,
  // cross-tab-message-sync) send real network requests that must not interleave with resets.
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  webServer: {
    command: `bun run build:web && bun run apps/server/src/main.ts serve --no-open --port ${PORT} --data-dir ./userdata-e2e`,
    url: `http://127.0.0.1:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: ROOT,
    // Force content logging OFF for the spawned server regardless of the repo .env. Playwright merges
    // this over process.env, and Bun honors a real env var over a .env value (verified), so test runs
    // never log message text. Azure creds still arrive via the inherited process.env.
    env: { ANVIKA_LOG_CONTENT: 'false' },
  },
});
