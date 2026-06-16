import { describe, expect, it } from 'vitest';

import { DB_FILENAME } from './db-file';

/**
 * The second assertion (drizzle-kit config imports `DB_FILENAME`) was dropped because
 * `drizzle.config.ts` lives outside the server's `rootDir` and TypeScript rejects the
 * cross-boundary import from a test file (`TS6059`/`TS6307`). The single-source-of-truth
 * contract is enforced structurally: `drizzle.config.ts` imports `DB_FILENAME` directly,
 * so the two cannot drift at build time.
 */
describe('DB_FILENAME', () => {
  it('is the shared anvika.db filename', () => {
    expect(DB_FILENAME).toBe('anvika.db');
  });
});
