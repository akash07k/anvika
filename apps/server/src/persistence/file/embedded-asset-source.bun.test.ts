import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EmbeddedAssetSource } from '../../assets/embedded-asset-source';

let dir: string;
let indexPath: string;
let jsPath: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'anvika-embed-'));
  indexPath = join(dir, 'index.html');
  jsPath = join(dir, 'app.js');
  writeFileSync(indexPath, '<div id="root"></div>');
  writeFileSync(jsPath, 'export const x = 1;');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('resolves a known asset to its embedded file', async () => {
  const src = new EmbeddedAssetSource(
    { '/index.html': indexPath, '/assets/app.js': jsPath },
    indexPath,
  );
  const res = await src.resolve('/assets/app.js');
  if (res === null) throw new Error('expected a response');
  expect(await res.text()).toBe('export const x = 1;');
});

test('falls back to index.html for the root and unknown SPA routes', async () => {
  const src = new EmbeddedAssetSource({ '/index.html': indexPath }, indexPath);
  const root = await src.resolve('/');
  if (root === null) throw new Error('expected index for root');
  expect(await root.text()).toContain('id="root"');
  const spa = await src.resolve('/conversations/42');
  if (spa === null) throw new Error('expected index fallback');
  expect(await spa.text()).toContain('id="root"');
});
