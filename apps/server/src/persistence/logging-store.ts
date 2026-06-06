import { serverLogger } from '../logging/logger';
import type { SettingsStore, StoredSettings } from './ports';

/** The default category segments for the persistence layer (`anvika.server.persistence`). */
const DEFAULT_CATEGORY = ['persistence'] as const;

/**
 * Wrap a {@link SettingsStore} so every `load`/`save` logs a content-safe outcome at `info` (and
 * `error` on failure) with `durationMs`, owner, schema `version`, and `found`/`bytes` - never the
 * settings data itself (`bytes` is `JSON.stringify(data).length`). The original error is re-raised
 * unchanged.
 *
 * @param store - The real settings store to wrap.
 * @param category - Category segments under `anvika.server`; defaults to `['persistence']`.
 * @returns A {@link SettingsStore} that logs around the wrapped store.
 */
export function withSettingsStoreLogging(
  store: SettingsStore,
  category: readonly string[] = DEFAULT_CATEGORY,
): SettingsStore {
  const log = serverLogger(...category);
  return {
    async load(owner: string): Promise<StoredSettings | null> {
      const start = Date.now();
      try {
        const row = await store.load(owner);
        log.info('settings load', {
          owner,
          found: row !== null,
          ...(row ? { version: row.version } : {}),
          durationMs: Date.now() - start,
        });
        return row;
      } catch (err) {
        log.error('settings load failed', {
          owner,
          durationMs: Date.now() - start,
          message: String(err),
        });
        throw err;
      }
    },
    async save(owner: string, data: unknown, version: number): Promise<void> {
      const start = Date.now();
      try {
        await store.save(owner, data, version);
        log.info('settings save', {
          owner,
          version,
          bytes: JSON.stringify(data).length,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        log.error('settings save failed', {
          owner,
          version,
          durationMs: Date.now() - start,
          message: String(err),
        });
        throw err;
      }
    },
  };
}
