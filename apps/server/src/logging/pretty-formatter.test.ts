import type { LogRecord } from '@logtape/logtape';
import { describe, expect, it } from 'vitest';

import { createConsoleFormatter, createFileFormatter, formatPretty } from './pretty-formatter';

/** A fixed local instant used so timestamp assertions are deterministic. */
const FIXED = new Date(2026, 4, 18, 0, 48, 29, 951);
const HUMAN = '18th May, 2026 at 12:48:29.951 AM';

function makeRecord(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    category: ['anvika', 'server', 'boot'],
    level: 'info',
    message: ['server listening'],
    properties: {},
    timestamp: FIXED.getTime(),
    rawMessage: 'server listening',
    ...overrides,
  } as LogRecord;
}

describe('formatPretty', () => {
  it('shows the category when showCategory is true', () => {
    const line = formatPretty(makeRecord(), { showCategory: true });
    expect(line).toBe(`INFO: server listening - [anvika.server.boot] | ${HUMAN}`);
  });

  it('hides the category when showCategory is false', () => {
    const line = formatPretty(makeRecord(), { showCategory: false });
    expect(line).toBe(`INFO: server listening | ${HUMAN}`);
  });

  it('renders a data segment with a formatted size', () => {
    const line = formatPretty(
      makeRecord({ properties: { url: 'http://127.0.0.1:7800/', size: 23_961 } }),
      { showCategory: true },
    );
    expect(line).toBe(
      `INFO: server listening - [anvika.server.boot] | ${HUMAN} { url: "http://127.0.0.1:7800/", size: 23.4 kb }`,
    );
  });

  it('renders a duration in the data segment', () => {
    const line = formatPretty(makeRecord({ properties: { durationMs: 1320 } }), {
      showCategory: false,
    });
    expect(line).toBe(`INFO: server listening | ${HUMAN} { durationMs: 1.32 s }`);
  });

  it('omits the data segment entirely when properties is empty', () => {
    const line = formatPretty(makeRecord({ properties: {} }), { showCategory: false });
    expect(line).not.toContain('{');
  });

  it('uppercases the level name', () => {
    const line = formatPretty(makeRecord({ level: 'warning' }), { showCategory: false });
    expect(line.startsWith('WARNING: ')).toBe(true);
  });

  it('concatenates a templated message with interpolated values', () => {
    const line = formatPretty(
      makeRecord({ message: ['bound port ', 7800, ' ok'], properties: {} }),
      { showCategory: false },
    );
    expect(line).toBe(`INFO: bound port 7800 ok | ${HUMAN}`);
  });
});

describe('createFileFormatter', () => {
  it('always shows the category and ends with a blank line', () => {
    const formatter = createFileFormatter();
    const out = formatter(makeRecord());
    expect(out).toBe(`INFO: server listening - [anvika.server.boot] | ${HUMAN}\n\n`);
  });
});

describe('createConsoleFormatter', () => {
  it('returns a single-element array ending in a newline, honouring showCategory', () => {
    const formatter = createConsoleFormatter({ showCategory: false });
    const out = formatter(makeRecord());
    expect(out).toEqual([`INFO: server listening | ${HUMAN}\n`]);
  });

  it('shows the category in debug mode', () => {
    const formatter = createConsoleFormatter({ showCategory: true });
    const out = formatter(makeRecord());
    expect(out).toEqual([`INFO: server listening - [anvika.server.boot] | ${HUMAN}\n`]);
  });
});
