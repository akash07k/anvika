import { resolve } from 'node:path';

import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

// Mirror the app's `@/*` alias (apps/web/vite.config.ts) so shadcn ui components resolve in the web
// test projects; Vitest does not load the app's Vite config and per-project Vite config wins, so the
// alias must live on each project that imports app code rather than at the root.
const webAlias = { '@': resolve(import.meta.dirname, 'apps/web/src') };

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/**/*.test.ts', 'apps/server/**/*.test.ts', 'tooling/**/*.test.ts'],
          // Keep bun:sqlite-importing adapter tests out of the Node/Vitest graph; they run under
          // `bun test` instead (ADR 0010). configDefaults.exclude preserves the node_modules default.
          exclude: [...configDefaults.exclude, '**/*.bun.test.ts'],
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/**/*.test.{ts,tsx}'],
          // Keep real-browser specs out of the fast jsdom path; they run only under the
          // explicit `web-browser` project. configDefaults.exclude preserves the
          // node_modules default that a custom exclude would otherwise replace.
          exclude: [...configDefaults.exclude, 'apps/web/**/*.browser.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/test-setup.ts'],
        },
      },
      {
        resolve: { alias: webAlias },
        // cmdk uses React hooks internally; without this it gets optimized after the initial
        // bundle, causing a React duplicate-instance crash ("Invalid hook call") in browser
        // tests that render Command-based components. Pre-bundling it alongside React keeps
        // a single React copy in scope for the whole test run.
        optimizeDeps: { include: ['cmdk'] },
        test: {
          name: 'web-browser',
          include: ['apps/web/**/*.browser.test.{ts,tsx}'],
          // Real Chromium via Playwright: needed for document.ariaNotify, real focus, and
          // real keyboard events that jsdom cannot observe (ADR 0013). Runs only in the
          // `verify` gate, never in the fast pre-commit `test` script.
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
