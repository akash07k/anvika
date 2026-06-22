import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatLogDateStamp, formatLogTimeStamp, sessionLogPaths, sweepOldLogs } from './retention';

// Mock `node:fs/promises` so a single `rm` call can be made to fail deterministically (simulating a
// locked/unremovable directory, e.g. EBUSY/EPERM on Windows) while every other fs call passes
// through to the real implementation. `rmFailOn.path` selects which target rejects.
const { rmFailOn } = vi.hoisted(() => ({ rmFailOn: { path: null as string | null } }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rm: (target: Parameters<typeof actual.rm>[0], options?: Parameters<typeof actual.rm>[1]) => {
      if (rmFailOn.path !== null && String(target).includes(rmFailOn.path)) {
        return Promise.reject(new Error('simulated rm failure (EPERM)'));
      }
      return actual.rm(target, options);
    },
  };
});

afterEach(() => {
  rmFailOn.path = null;
});

describe('sweepOldLogs', () => {
  let dir: string;
  const now = new Date(2026, 4, 18, 12, 0, 0, 0);

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'anvika-retention-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('deletes only date directories older than the cutoff, keeping recent ones', async () => {
    const oldStamp = formatLogDateStamp(new Date(2026, 3, 18)); // 30 days before now
    const recentStamp = formatLogDateStamp(new Date(2026, 4, 17)); // 1 day before now
    await mkdir(join(dir, oldStamp));
    await writeFile(join(dir, oldStamp, '09-00-00-1.log'), 'old');
    await mkdir(join(dir, recentStamp));
    await writeFile(join(dir, recentStamp, '09-00-00-1.log'), 'recent');

    const deleted = await sweepOldLogs({ dir, retentionDays: 14, now });

    expect(deleted).toEqual([oldStamp]);
    expect((await readdir(dir)).toSorted()).toEqual([recentStamp]);
  });

  it('never deletes latest.log or non-date entries', async () => {
    await writeFile(join(dir, 'latest.log'), 'latest');
    await writeFile(join(dir, 'notes.txt'), 'unrelated');
    const oldStamp = formatLogDateStamp(new Date(2026, 0, 1));
    await mkdir(join(dir, oldStamp));

    const deleted = await sweepOldLogs({ dir, retentionDays: 14, now });

    expect(deleted).toEqual([oldStamp]);
    expect((await readdir(dir)).toSorted()).toEqual(['latest.log', 'notes.txt'].toSorted());
  });

  it("keeps today's date directory (the stamp/parse pair stays consistent)", async () => {
    await mkdir(join(dir, formatLogDateStamp(now)));
    const deleted = await sweepOldLogs({ dir, retentionDays: 14, now });
    expect(deleted).toEqual([]);
  });

  it('uses local-calendar-day boundaries: a directory exactly retentionDays old is kept', async () => {
    // now is 2026-05-18; the cutoff is local midnight 14 calendar days earlier (2026-05-04).
    const boundary = formatLogDateStamp(new Date(2026, 4, 4)); // exactly 14 days before now -> kept
    const older = formatLogDateStamp(new Date(2026, 4, 3)); // 15 days before now -> swept
    await mkdir(join(dir, boundary));
    await mkdir(join(dir, older));

    const deleted = await sweepOldLogs({ dir, retentionDays: 14, now });

    expect(deleted).toEqual([older]);
    expect((await readdir(dir)).toSorted()).toEqual([boundary]);
  });

  it('returns an empty array and does not throw when the directory is missing', async () => {
    const deleted = await sweepOldLogs({ dir: join(dir, 'nope'), retentionDays: 14, now });
    expect(deleted).toEqual([]);
  });

  it('continues the sweep when one entry fails to delete', async () => {
    const oldA = formatLogDateStamp(new Date(2026, 0, 1));
    const oldB = formatLogDateStamp(new Date(2026, 0, 2));
    await mkdir(join(dir, oldA));
    await mkdir(join(dir, oldB));
    rmFailOn.path = oldA; // the oldA directory cannot be removed (simulated lock)

    const deleted = await sweepOldLogs({ dir, retentionDays: 14, now });

    // oldB is still deleted and reported; oldA's failure is swallowed and does not abort the sweep.
    expect(deleted).toEqual([oldB]);
    expect((await readdir(dir)).toSorted()).toEqual([oldA]);
  });
});

describe('formatLogTimeStamp', () => {
  it('formats local time as colon-free zero-padded HH-MM-SS', () => {
    expect(formatLogTimeStamp(new Date(2026, 5, 9, 9, 4, 7))).toBe('09-04-07');
    expect(formatLogTimeStamp(new Date(2026, 5, 9, 23, 59, 0))).toBe('23-59-00');
  });
});

describe('sessionLogPaths', () => {
  it('builds the date dir, the session file, and the fixed latest file', () => {
    const paths = sessionLogPaths({
      dataDir: '/data',
      dateStamp: '2026-06-09',
      timeStamp: '09-04-07',
      pid: 4242,
    });
    expect(paths.dir).toBe(join('/data', 'logs', '2026-06-09'));
    expect(paths.sessionFile).toBe(join('/data', 'logs', '2026-06-09', '09-04-07-4242.log'));
    expect(paths.latestFile).toBe(join('/data', 'logs', 'latest.log'));
  });
});
