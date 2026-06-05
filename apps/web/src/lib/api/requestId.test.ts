import { REQUEST_ID_HEADER } from '@anvika/shared/chat';
import { describe, expect, it } from 'vitest';

import { beginTurn, newRequestId } from './requestId';

describe('requestId', () => {
  it('mints a short, bounded, content-free hex id (the documented 8-hex-char contract)', () => {
    // Pin the exact contract so an accidental change to the UUID slice length is caught.
    expect(newRequestId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('beginTurn stores the id in the caller ref and returns the matching header', () => {
    const ref = { current: '' };
    const headers = beginTurn(ref);
    expect(ref.current).not.toBe('');
    expect(headers).toEqual({ [REQUEST_ID_HEADER]: ref.current });
  });

  it('mints a fresh id per turn, and separate refs never collide (concurrent turns)', () => {
    const a = { current: '' };
    const b = { current: '' };
    beginTurn(a);
    beginTurn(b);
    expect(a.current).not.toBe('');
    expect(b.current).not.toBe(a.current);
  });
});
