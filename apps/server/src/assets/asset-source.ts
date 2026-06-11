/**
 * A source of static web-client assets. Implementations resolve a request pathname to the
 * Response that serves the matching file, applying SPA index.html fallback for unmatched
 * routes. Returning a `Response` (a global) keeps this port free of Bun types, so `app.ts`
 * (loaded by Node-vitest) need not import anything Bun-specific. The implementations are the
 * on-disk {@link FilesystemAssetSource} (source/dev) and the embedded `EmbeddedAssetSource`
 * (compiled binary).
 */
export interface AssetSource {
  /**
   * Resolve a request pathname to a Response serving the file, or `null` when nothing is
   * servable (a path-traversal attempt, or no index.html to fall back to).
   *
   * @param pathname - The request URL pathname (e.g. `/`, `/assets/index-abc.js`).
   * @returns The Response to send, or `null`.
   */
  resolve(pathname: string): Promise<Response | null>;
}
