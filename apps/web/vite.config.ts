import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Read an `ANVIKA_*` boolean dev toggle (`1`/`true` is on). */
const envFlag = (value: string | undefined): boolean => value === '1' || value === 'true';

export default defineConfig({
  root: resolve(import.meta.dirname, '.'),
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  plugins: [
    tailwindcss(),
    // Ignore colocated test files (e.g. `settings.test.tsx`) so the route generator does not warn
    // about non-route files living next to their route under `src/routes/`.
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeFileIgnorePattern: '\\.(test|spec)\\.',
    }),
    react({ babel: { plugins: [['babel-plugin-react-compiler', {}]] } }),
  ],
  server: {
    port: 5173,
    // Open the browser when the dev server starts; set ANVIKA_NO_OPEN=1 to suppress it.
    open: !envFlag(process.env.ANVIKA_NO_OPEN),
    // Localhost only by default: the app has no auth (single owner 'local'), so do not expose it
    // on an untrusted network. Set ANVIKA_HOST=1 to expose it on the LAN for testing.
    host: envFlag(process.env.ANVIKA_HOST),
    proxy: { '/api': 'http://127.0.0.1:7800' },
  },
  build: { outDir: 'dist' },
});
