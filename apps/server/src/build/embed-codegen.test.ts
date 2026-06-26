import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildEmbedSource } from './embed-codegen';

let root: string;
let distDir: string;
let drizzleDir: string;
let outDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'anvika-codegen-'));
  distDir = join(root, 'dist');
  drizzleDir = join(root, 'drizzle');
  outDir = join(root, 'gen');
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  mkdirSync(join(drizzleDir, 'meta'), { recursive: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(distDir, 'index.html'), '<div id="root"></div>');
  writeFileSync(join(distDir, 'assets', 'app.js'), 'export const x = 1;');
  writeFileSync(
    join(drizzleDir, 'meta', '_journal.json'),
    JSON.stringify({ entries: [{ tag: '0000_init', when: 7, breakpoints: true }] }),
  );
  writeFileSync(join(drizzleDir, '0000_init.sql'), 'CREATE TABLE t (id integer);');
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('buildEmbedSource', () => {
  it('emits file-type imports and an exact URL manifest for every dist file (plain JS)', () => {
    const out = buildEmbedSource({ distDir, drizzleDir, outDir });
    expect(out).toContain(`with { type: 'file' }`);
    expect(out).toContain(`"/index.html"`);
    expect(out).toContain(`"/assets/app.js"`);
    expect(out).toContain('export const WEB_INDEX =');
    expect(out).toContain('export const WEB_ASSETS =');
    // Plain JS: no TypeScript type annotation on the manifest.
    expect(out).not.toContain('Record<string, string>');
    // Import specifiers must be relative (not drive-lettered absolute paths).
    expect(out).not.toMatch(/from "[A-Za-z]:/);
    expect(out).toContain('from "../');
  });

  it('inlines each migration with journal metadata and raw SQL', () => {
    const out = buildEmbedSource({ distDir, drizzleDir, outDir });
    expect(out).toContain(`tag: "0000_init"`);
    expect(out).toContain('when: 7');
    expect(out).toContain('CREATE TABLE t (id integer);');
  });

  it('throws when the web build is missing', () => {
    rmSync(join(distDir, 'index.html'));
    let message = '';
    try {
      buildEmbedSource({ distDir, drizzleDir, outDir });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('Web build missing');
  });
});
