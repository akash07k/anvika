import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./connection', () => ({ createDb: vi.fn() }));

import { createDb } from './connection';
import { openDatabase } from './open-database';

afterEach(() => vi.restoreAllMocks());

describe('openDatabase', () => {
  it('returns the handle createDb produced on success', () => {
    const handle = { tag: 'db' };
    vi.mocked(createDb).mockReturnValueOnce(handle as never);
    expect(openDatabase('/data')).toBe(handle);
  });

  it('rethrows a createDb failure as an actionable error naming the path and --data-dir', () => {
    vi.mocked(createDb).mockImplementationOnce(() => {
      throw new Error('bun:sqlite: unable to open database file');
    });
    expect(() => openDatabase('/data')).toThrow(/could not open its database/);
    vi.mocked(createDb).mockImplementationOnce(() => {
      throw new Error('bun:sqlite: unable to open database file');
    });
    expect(() => openDatabase('/data')).toThrow(/--data-dir/);
  });
});
