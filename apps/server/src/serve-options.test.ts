import { describe, expect, it } from 'vitest';

import { buildServeOptions } from './serve-options';

/** A trivial fetch handler used to assert identity passthrough. */
const handler = (): Response => new Response('ok');

describe('buildServeOptions', () => {
  it('binds loopback and sets a generous idle timeout so slow reasoning streams are not aborted', () => {
    const opts = buildServeOptions(7800, handler);

    expect(opts.port).toBe(7800);
    expect(opts.hostname).toBe('127.0.0.1');
    // Bun's default idleTimeout is 10s, which reclaims a connection that sends no bytes for 10s.
    // A reasoning model "thinks" silently before its first token, so that default aborts the turn
    // mid-stream (the client is stuck "generating"). We raise it to Bun's maximum, 255 seconds.
    expect(opts.idleTimeout).toBe(255);
    expect(opts.fetch).toBe(handler);
  });
});
