import { describe, expect, it } from 'vitest';

import { CLIENT_LOG_EVENT_MESSAGES, ClientLogEventSchema } from './client-log';

describe('ClientLog codes', () => {
  it('accepts a known event code', () => {
    expect(ClientLogEventSchema.parse('app-mounted')).toBe('app-mounted');
  });
  it('rejects an unknown event code', () => {
    expect(() => ClientLogEventSchema.parse('totally-made-up')).toThrow();
  });
  it('has a message for every code', () => {
    for (const code of ClientLogEventSchema.options) {
      expect(CLIENT_LOG_EVENT_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});
