import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write';

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('writeFileAtomic', () => {
  it('writes content and overwrites an existing file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'anvika-aw-'));
    const path = join(dir, 'f.json');
    await writeFile(path, 'old');
    await writeFileAtomic(path, 'new');
    expect(await readFile(path, 'utf8')).toBe('new');
  });

  it('leaves no temp files behind', async () => {
    dir = await mkdtemp(join(tmpdir(), 'anvika-aw-'));
    await writeFileAtomic(join(dir, 'f.json'), 'x');
    expect((await readdir(dir)).filter((n) => n.includes('.tmp'))).toHaveLength(0);
  });

  it('retries rename on a transient EBUSY then succeeds with the file written and no temp left', async () => {
    dir = await mkdtemp(join(tmpdir(), 'anvika-aw-'));
    const path = join(dir, 'f.json');
    // Drive the retry/backoff loop deterministically via the injectable rename: the first attempt
    // throws a Windows-style transient lock error, the second delegates to the real rename. (Mocking
    // node:fs/promises with bun's mock.module hangs the runner here, so injection is the seam.)
    let renameCalls = 0;
    const fakeRename = (from: string, to: string): Promise<void> => {
      renameCalls += 1;
      if (renameCalls === 1) {
        return Promise.reject(Object.assign(new Error('locked'), { code: 'EBUSY' }));
      }
      return rename(from, to);
    };
    await writeFileAtomic(path, 'after-retry', { rename: fakeRename });
    expect(renameCalls).toBeGreaterThanOrEqual(2);
    expect(await readFile(path, 'utf8')).toBe('after-retry');
    expect((await readdir(dir)).filter((n) => n.includes('.tmp'))).toHaveLength(0);
  });
});
