import { formatBytes, formatDuration } from './format';

/** Property keys whose numeric value is rendered as a byte size. */
const SIZE_KEYS = new Set(['size', 'bytes']);

/** Property keys whose numeric value is rendered as a duration. */
const DURATION_KEYS = new Set(['ms', 'duration', 'durationMs', 'elapsed', 'elapsedMs']);

/**
 * JSON-stringify a value without ever throwing: BigInt becomes its decimal string, a true
 * circular reference becomes `"[Circular]"`, and any other failure (or a value JSON cannot
 * represent) falls back to `"[unserializable]"`. A log formatter must never throw.
 *
 * Circularity is detected against the active ANCESTOR path, not against every value seen, so
 * a shared (non-circular) reference appearing in sibling branches is rendered normally rather
 * than mis-flagged as circular.
 *
 * @param value - Any object or array value to render.
 * @returns A safe JSON string.
 */
function safeStringify(value: unknown): string {
  const ancestors: object[] = [];
  function replacer(this: unknown, _key: string, val: unknown): unknown {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val !== 'object' || val === null) return val;
    // Trim ancestors back to the holder of this value, then flag only a genuine cycle.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
    if (ancestors.includes(val)) return '[Circular]';
    ancestors.push(val);
    return val;
  }
  try {
    const json = JSON.stringify(value, replacer);
    return json ?? '[unserializable]';
  } catch {
    return '[unserializable]';
  }
}

/**
 * Render a single property value per the data rules.
 *
 * @param key - The property key (drives the size/duration heuristics).
 * @param value - The property value.
 * @returns The rendered value fragment (no key, no surrounding braces).
 */
function renderValue(key: string, value: unknown): string {
  if (typeof value === 'number') {
    if (SIZE_KEYS.has(key)) return formatBytes(value);
    if (DURATION_KEYS.has(key)) return formatDuration(value);
    return String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  return safeStringify(value);
}

/**
 * Render a log record's structured `properties` into a `{ key: value, ... }` segment.
 * Size keys use {@link formatBytes}, duration keys use
 * {@link formatDuration}; strings are JSON-quoted; objects/arrays are safely stringified
 * (BigInt-safe and circular-safe, never throws).
 *
 * @param properties - The structured data attached to the log record.
 * @returns The rendered data segment, or `''` when there are no properties.
 */
export function renderLogData(properties: Record<string, unknown>): string {
  const keys = Object.keys(properties);
  if (keys.length === 0) return '';
  const parts = keys.map((key) => `${key}: ${renderValue(key, properties[key])}`);
  return `{ ${parts.join(', ')} }`;
}
