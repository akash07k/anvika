import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildEmbedSource } from '../apps/server/src/build/embed-codegen';

const root = resolve(import.meta.dir, '..');
const outDir = join(root, 'apps', 'server', 'src', 'generated');
mkdirSync(outDir, { recursive: true });
const source = buildEmbedSource({
  distDir: join(root, 'apps', 'web', 'dist'),
  drizzleDir: join(root, 'apps', 'server', 'drizzle'),
  outDir,
});
writeFileSync(join(outDir, 'embedded.js'), source);
process.stdout.write(`Generated ${join(outDir, 'embedded.js')}\n`);
