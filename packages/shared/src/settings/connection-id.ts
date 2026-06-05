// packages/shared/src/settings/connection-id.ts
/**
 * Slugify a connection label into the id charset: lowercase, every run of characters outside
 * `[a-z0-9]` collapsed to a single hyphen, leading/trailing hyphens trimmed. Returns an empty string
 * when the label has no slug-able characters (e.g. emoji-only or non-Latin), so the caller can apply a
 * deterministic fallback.
 *
 * @param label - The human-facing connection label.
 * @returns The slug, or an empty string when nothing slug-able remains.
 */
export function slugifyConnectionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Derive a default, unique connection id at creation time. Prefers the label's slug; when the label
 * has no slug-able characters, falls back to the connection `type` plus a numeric suffix. Appends the
 * lowest free `-N` suffix needed to avoid colliding with an existing id. The result is always a
 * non-empty, colon-free slug; the user may still override it before saving.
 *
 * @param label - The connection label.
 * @param type - The connection type, used for the no-slug fallback base.
 * @param existingIds - The ids already in use (for collision avoidance).
 * @returns A unique default id.
 */
export function deriveConnectionId(label: string, type: string, existingIds: string[]): string {
  const taken = new Set(existingIds);
  const base = slugifyConnectionId(label);
  if (base.length > 0 && !taken.has(base)) return base;
  const root = base.length > 0 ? base : type;
  for (let n = 1; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
