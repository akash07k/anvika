/**
 * Declaration for the build-generated embedded module (`generated/embedded.js`). That `.js` is
 * produced by `tooling/generate-embed.ts` before `bun build --compile` and is gitignored; this
 * committed declaration lets `tsc` resolve imports in a source checkout where the `.js` is
 * absent (and `allowJs` is false, so the `.js` is never typechecked). Only the compile
 * entrypoint (`main.compiled.ts`) imports the module at runtime.
 */

/** Map of request URL path (e.g. `/assets/index-abc.js`) to embedded file path. */
export const WEB_ASSETS: Record<string, string>;

/** Embedded path of index.html, served for unmatched SPA routes. */
export const WEB_INDEX: string;

/** One embedded Drizzle migration: journal metadata plus the raw SQL. */
export interface EmbeddedMigration {
  /** Journal tag, e.g. `0000_conversation`. */
  readonly tag: string;
  /** Journal `when` timestamp (folderMillis) used for ordering and tracking. */
  readonly when: number;
  /** Whether statement breakpoints are enabled for this migration. */
  readonly breakpoints: boolean;
  /** Raw SQL file content (split on `--> statement-breakpoint` at apply time). */
  readonly sql: string;
}

/** All embedded migrations, in journal order. */
export const MIGRATIONS: readonly EmbeddedMigration[];
