import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runCli } from './cli';
import { FilesystemAssetSource } from './assets/filesystem-asset-source';
import { DEFAULT_DATA_DIR } from './config/bootstrap';
import { runMigrations } from './persistence/drizzle/migrate';

// Process entry point for source and dev. The compiled binary uses `main.compiled.ts`.
if (import.meta.main) {
  const webDist = resolve(import.meta.dir, '..', '..', 'web', 'dist');
  const webDistDir = existsSync(join(webDist, 'index.html')) ? webDist : undefined;
  await runCli(process.argv.slice(2), {
    description: webDistDir ? 'source (filesystem assets)' : 'source (no web client built)',
    assetSource: webDistDir ? new FilesystemAssetSource(webDistDir) : undefined,
    migrate: runMigrations,
    defaultDataDir: DEFAULT_DATA_DIR,
  });
}
