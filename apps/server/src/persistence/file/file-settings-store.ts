import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { mergeSecrets, partitionSecrets } from '@anvika/shared/settings/partition';
import type { Settings } from '@anvika/shared/settings/schema';

import type { SettingsStore, StoredSettings } from '../ports';
import { writeFileAtomic } from './atomic-write';

/**
 * The on-disk `settings.json` envelope, validated on read-back (a trust boundary): a
 * numeric schema `version` plus the opaque `settings` payload. `settings` stays `unknown` here on
 * purpose - its deep shape is owned and validated downstream by the service layer (against
 * `SettingsSchema`, after forward migrations). A malformed envelope (missing/non-numeric version,
 * or a non-object) fails this parse and surfaces as a {@link SettingsReadError}.
 */
const SettingsEnvelopeSchema = z.object({ version: z.number(), settings: z.unknown() });

/** Thrown when a settings/secrets file exists but cannot be read or parsed (never the value). */
export class SettingsReadError extends Error {
  /**
   * @param path - The file that could not be read or parsed.
   * @param cause - The underlying read/parse error.
   */
  constructor(path: string, cause: unknown) {
    super(`Settings file could not be read: ${path}`);
    this.name = 'SettingsReadError';
    this.cause = cause;
  }
}

/** Read a file, returning null when absent (ENOENT) and rethrowing other read errors. */
async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') return null;
    throw new SettingsReadError(path, err);
  }
}

/**
 * File-backed {@link SettingsStore}: non-secret settings in `settings.json` (a
 * `{ version, settings }` envelope) and secret leaves in `secrets.json`, both in the data dir.
 * `save` partitions by the schema `secret` flag and writes each file atomically under an
 * in-process write mutex; `load` recombines them. A present-but-unreadable file throws
 * {@link SettingsReadError} (the service maps that to defaults with `recovered: true`); an absent
 * `settings.json` returns `null` (first run). Secrets get best-effort `0600` permissions.
 */
export class FileSettingsStore implements SettingsStore {
  private readonly settingsPath: string;
  private readonly secretsPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  /** @param dataDir - The resolved application data directory. */
  constructor(dataDir: string) {
    this.settingsPath = join(dataDir, 'settings.json');
    this.secretsPath = join(dataDir, 'secrets.json');
  }

  /** Resolved on-disk paths (for the API to surface to the client). */
  get paths(): { settings: string; secrets: string } {
    return { settings: this.settingsPath, secrets: this.secretsPath };
  }

  /**
   * Load the persisted settings row for `owner`, recombining `settings.json` and `secrets.json`,
   * or `null` when `settings.json` is absent (first run).
   *
   * @param _owner - The settings owner (a single file pair, so unused).
   * @returns The merged stored row, or `null`.
   */
  async load(_owner: string): Promise<StoredSettings | null> {
    const settingsRaw = await readOptional(this.settingsPath);
    if (settingsRaw === null) return null;
    let envelope: unknown;
    try {
      envelope = JSON.parse(settingsRaw);
    } catch (err) {
      throw new SettingsReadError(this.settingsPath, err);
    }
    const parsedEnvelope = SettingsEnvelopeSchema.safeParse(envelope);
    if (!parsedEnvelope.success) {
      throw new SettingsReadError(this.settingsPath, parsedEnvelope.error);
    }
    const { version, settings } = parsedEnvelope.data;
    const secretsRaw = await readOptional(this.secretsPath);
    let secrets: unknown = {};
    if (secretsRaw !== null) {
      try {
        secrets = JSON.parse(secretsRaw);
      } catch (err) {
        throw new SettingsReadError(this.secretsPath, err);
      }
    }
    return { data: mergeSecrets(settings, secrets), version };
  }

  /**
   * Persist (upsert) the whole settings `data` at schema `version`, splitting secret leaves into
   * `secrets.json` (mode `0600`) and the rest into `settings.json`, each written atomically and
   * serialized through an in-process write mutex.
   *
   * @param _owner - The settings owner (a single file pair, so unused).
   * @param data - The full validated settings object to store.
   * @param version - The schema version `data` conforms to.
   */
  async save(_owner: string, data: unknown, version: number): Promise<void> {
    const { public: pub, secrets } = partitionSecrets(data as Settings);
    const settingsJson = `${JSON.stringify({ version, settings: pub }, null, 2)}\n`;
    const secretsJson = `${JSON.stringify(secrets, null, 2)}\n`;
    const run = this.writeQueue.then(async () => {
      // Write secrets.json BEFORE settings.json: a crash between the two then at worst leaves a secret
      // with no public connection referencing it, which `mergeSecrets` orphan-drops on load (the
      // self-healing direction). The reverse order could strand a public connection whose just-set
      // secret was lost. Atomic-pair/CAS hardening remains deferred.
      await writeFileAtomic(this.secretsPath, secretsJson, { mode: 0o600 });
      await writeFileAtomic(this.settingsPath, settingsJson);
    });
    this.writeQueue = run.catch(() => undefined);
    await run;
  }
}
