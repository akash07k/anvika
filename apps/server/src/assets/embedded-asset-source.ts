import type { AssetSource } from './asset-source';

/**
 * Serve web-client assets embedded in the compiled binary, looked up by exact URL path from the
 * build-generated manifest. Embedded files always exist, so no existence check is needed;
 * unmatched paths fall back to the embedded index.html (SPA routes), matching
 * {@link FilesystemAssetSource} behavior.
 */
export class EmbeddedAssetSource implements AssetSource {
  private readonly assets: Record<string, string>;
  private readonly indexPath: string;

  /**
   * @param assets - Map of request URL path to embedded file path (the generated `WEB_ASSETS`).
   * @param indexPath - Embedded path of index.html, served for unmatched SPA routes.
   */
  constructor(assets: Record<string, string>, indexPath: string) {
    this.assets = assets;
    this.indexPath = indexPath;
  }

  /**
   * @inheritdoc
   * Note: this implementation never returns `null`. Embedded files are guaranteed present in
   * the binary, and any unmatched path falls back to the embedded index.html (SPA routing), so
   * there is always a servable Response. The `| null` exists only to satisfy the shared port;
   * the 404 branch in `app.ts` is reachable only for the filesystem source.
   */
  resolve(pathname: string): Promise<Response | null> {
    const key = pathname === '/' ? '/index.html' : pathname;
    const embedded = this.assets[key] ?? this.indexPath;
    return Promise.resolve(new Response(Bun.file(embedded)));
  }
}
