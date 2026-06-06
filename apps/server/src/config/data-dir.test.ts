import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveDataDir } from './data-dir';

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'anvika-'));
});
afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('resolveDataDir', () => {
  it('prefers the explicit flag over env and default', () => {
    const target = join(base, 'flagdir');
    const result = resolveDataDir({
      flag: target,
      env: join(base, 'envdir'),
      defaultDir: join(base, 'def'),
    });
    expect(result).toBe(target);
  });

  it('falls back to env when no flag is given', () => {
    const target = join(base, 'envdir');
    const result = resolveDataDir({ env: target, defaultDir: join(base, 'def') });
    expect(result).toBe(target);
  });

  it('falls back to the default when neither flag nor env is given', () => {
    const target = join(base, 'def');
    const result = resolveDataDir({ defaultDir: target });
    expect(result).toBe(target);
  });

  it('creates the directory and the logs subdirectory', () => {
    const target = join(base, 'created');
    resolveDataDir({ defaultDir: target });
    const logsPath = join(target, 'logs');
    expect(existsSync(logsPath)).toBe(true);
    expect(statSync(logsPath).isDirectory()).toBe(true);
  });

  // Trust boundary: an unwritable resolved data dir must fail loudly with an actionable
  // message at startup, not be accepted and crash later on the first write. Skipped on Windows (a
  // Windows owner ignores the read-only mode bit) and as root (uid 0 bypasses the W_OK check), since
  // accessSync(W_OK) would not trip in either case.
  it.skipIf(
    process.platform === 'win32' ||
      (typeof process.getuid === 'function' && process.getuid() === 0),
  )('throws an actionable error when the resolved data directory is not writable', () => {
    const target = join(base, 'readonly');
    // Pre-create the dir AND its logs subdir so the recursive mkdirs no-op (they need no write on
    // an existing path); then strip write so only the accessSync writability check trips.
    mkdirSync(join(target, 'logs'), { recursive: true });
    chmodSync(target, 0o500);
    try {
      expect(() => resolveDataDir({ defaultDir: target })).toThrow(/not writable/i);
    } finally {
      chmodSync(target, 0o700); // restore so afterEach cleanup can remove it
    }
  });
});
