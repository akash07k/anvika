import { describe, expect, it } from 'vitest';

import { renderLogData } from './log-data';

describe('renderLogData', () => {
  it('returns an empty string for no properties', () => {
    expect(renderLogData({})).toBe('');
  });

  it('formats a size key with formatBytes (unquoted)', () => {
    expect(renderLogData({ size: 23_961 })).toBe('{ size: 23.4 kb }');
  });

  it('formats a bytes key with formatBytes', () => {
    expect(renderLogData({ bytes: 234 })).toBe('{ bytes: 234 bytes }');
  });

  it('formats duration keys with formatDuration (unquoted)', () => {
    expect(renderLogData({ ms: 47 })).toBe('{ ms: 47 ms }');
    expect(renderLogData({ durationMs: 1320 })).toBe('{ durationMs: 1.32 s }');
    expect(renderLogData({ elapsed: 123_000 })).toBe('{ elapsed: 2 m 3 s }');
  });

  it('quotes strings as JSON', () => {
    expect(renderLogData({ path: 'notes/groceries.md' })).toBe('{ path: "notes/groceries.md" }');
  });

  it('renders plain numbers and booleans literally', () => {
    expect(renderLogData({ port: 7800, open: true })).toBe('{ port: 7800, open: true }');
  });

  it('renders null and undefined as keywords', () => {
    expect(renderLogData({ a: null, b: undefined })).toBe('{ a: null, b: undefined }');
  });

  it('JSON-stringifies objects and arrays', () => {
    expect(renderLogData({ ids: [1, 2], meta: { k: 'v' } })).toBe(
      '{ ids: [1,2], meta: {"k":"v"} }',
    );
  });

  it('joins multiple keys with a comma and space', () => {
    expect(renderLogData({ url: 'http://x/', size: 234 })).toBe(
      '{ url: "http://x/", size: 234 bytes }',
    );
  });

  it('renders a top-level bigint as its decimal string', () => {
    expect(renderLogData({ count: 5n })).toBe('{ count: 5 }');
  });

  it('does not throw on a circular object and marks it', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    let out = '';
    expect(() => {
      out = renderLogData({ obj: circular });
    }).not.toThrow();
    expect(out).toContain('[Circular]');
  });

  it('does not throw on a bigint nested in an object', () => {
    expect(() => renderLogData({ obj: { big: 10n } })).not.toThrow();
    expect(renderLogData({ obj: { big: 10n } })).toContain('10');
  });

  it('does not mark a shared (non-circular) reference as circular', () => {
    const shared = { x: 1 };
    const out = renderLogData({ obj: { a: shared, b: shared } });
    expect(out).not.toContain('[Circular]');
    expect(out).toBe('{ obj: {"a":{"x":1},"b":{"x":1}} }');
  });
});
