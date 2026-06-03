import { describe, expect, it } from 'vitest';

import { parseListeners } from './kill-dev';

describe('parseListeners', () => {
  it('parses lsof output, including hyphenated and dotted usernames (regression: \\w+ to \\S+)', () => {
    const out = [
      'node      12345 my-user   23u  IPv4 0x1234      0t0  TCP 127.0.0.1:7800 (LISTEN)',
      'vite      67890 first.last 30u IPv4 0xabcd      0t0  TCP 127.0.0.1:5173 (LISTEN)',
      'bun       11111 alice     12u  IPv4 0x9999      0t0  TCP 127.0.0.1:7820 (LISTEN)',
    ].join('\n');
    expect(parseListeners(out, 'linux')).toEqual([
      { pid: 12345, port: 7800 },
      { pid: 67890, port: 5173 },
      { pid: 11111, port: 7820 },
    ]);
  });

  it('parses Windows netstat LISTENING lines and ignores other states/headers', () => {
    const out = [
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    127.0.0.1:7800         0.0.0.0:0              LISTENING       20244',
      '  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       4567',
      '  TCP    127.0.0.1:54321        93.184.216.34:443      ESTABLISHED     9999',
    ].join('\n');
    expect(parseListeners(out, 'win32')).toEqual([
      { port: 7800, pid: 20244 },
      { port: 5173, pid: 4567 },
    ]);
  });

  it('returns nothing for empty or unmatched output', () => {
    expect(parseListeners('', 'linux')).toEqual([]);
    expect(parseListeners('garbage line with no match\n', 'win32')).toEqual([]);
  });
});
