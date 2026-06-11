import { join, normalize, sep } from 'node:path';

import type { AssetSource } from './asset-source';

/**
 * Serve built web-client assets from an on-disk directory (source and dev mode). Guards against
 * path traversal and falls back to index.html for unmatched SPA routes.
 */
export class FilesystemAssetSource implements AssetSource {
  private readonly dist: string;

  /** @param dist - Absolute path to the built web client directory. Trailing separators are stripped. */
  constructor(dist: string) {
    this.dist = dist.endsWith(sep) ? dist.slice(0, -1) : dist;
  }

  /** @inheritdoc */
  async resolve(pathname: string): Promise<Response | null> {
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = normalize(join(this.dist, rel));
    // The resolved file must live strictly under dist; append the separator so a sibling like
    // `<dist>distractor` cannot pass.
    if (!candidate.startsWith(this.dist + sep)) return null;
    const file = Bun.file(candidate);
    if (await file.exists()) return new Response(file);
    const index = Bun.file(join(this.dist, 'index.html'));
    if (await index.exists()) return new Response(index);
    return null;
  }
}
