import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';

import { FilesystemAssetSource } from '../../assets/filesystem-asset-source';

let dist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'anvika-fs-assets-'));
  writeFileSync(join(dist, 'index.html'), '<div id="root"></div>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'export const x = 1;');
});

afterAll(() => rmSync(dist, { recursive: true, force: true }));

test('serves an existing nested asset', async () => {
  const src = new FilesystemAssetSource(dist);
  const res = await src.resolve('/assets/app.js');
  if (res === null) throw new Error('expected a response');
  expect(await res.text()).toBe('export const x = 1;');
});

test('falls back to index.html for the root and unknown SPA routes', async () => {
  const src = new FilesystemAssetSource(dist);
  const root = await src.resolve('/');
  if (root === null) throw new Error('expected index for root');
  expect(await root.text()).toContain('id="root"');
  const spa = await src.resolve('/some/client/route');
  if (spa === null) throw new Error('expected index fallback');
  expect(await spa.text()).toContain('id="root"');
});

test('refuses a path-traversal attempt', async () => {
  const src = new FilesystemAssetSource(dist);
  expect(await src.resolve('/../secret')).toBeNull();
});

test('tolerates a dist path with a trailing separator', async () => {
  const src = new FilesystemAssetSource(dist + sep);
  const res = await src.resolve('/assets/app.js');
  if (res === null) throw new Error('expected a response with a trailing-separator dist');
  expect(await res.text()).toBe('export const x = 1;');
});
