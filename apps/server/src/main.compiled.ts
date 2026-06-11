import { dirname, join } from 'node:path';

import { runCli } from './cli';
import { EmbeddedAssetSource } from './assets/embedded-asset-source';
import { DEFAULT_DATA_DIR } from './config/bootstrap';
import { MIGRATIONS, WEB_ASSETS, WEB_INDEX } from './generated/embedded';
import { runEmbeddedMigrations } from './persistence/drizzle/embedded-migrate';

// Entry point for the compiled binary: embedded assets, embedded migrations, and a data dir
// anchored next to the executable. `bun build --compile` targets this file.
if (import.meta.main) {
  await runCli(process.argv.slice(2), {
    description: 'embedded binary',
    assetSource: new EmbeddedAssetSource(WEB_ASSETS, WEB_INDEX),
    migrate: (db) => runEmbeddedMigrations(db, MIGRATIONS),
    defaultDataDir: join(dirname(process.execPath), DEFAULT_DATA_DIR),
  });
}
