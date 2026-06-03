import { defineConfig } from 'drizzle-kit';

import { DB_FILENAME } from './apps/server/src/persistence/drizzle/db-file';

/**
 * drizzle-kit configuration. Migrations are generated from the schema into
 * `apps/server/drizzle/` and applied programmatically at server startup
 * (see `apps/server/src/persistence/drizzle/migrate.ts`), so `dbCredentials`
 * is only used by ad-hoc `drizzle-kit` CLI commands (studio, manual migrate).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './apps/server/src/persistence/drizzle/schema.ts',
  out: './apps/server/drizzle',
  dbCredentials: {
    url: process.env.ANVIKA_DATA_DIR
      ? `${process.env.ANVIKA_DATA_DIR}/${DB_FILENAME}`
      : `./userdata/${DB_FILENAME}`,
  },
});
