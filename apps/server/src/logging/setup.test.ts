import { describe, expect, it } from 'vitest';

import { buildLoggers } from './setup';

describe('buildLoggers', () => {
  it('sets the base anvika level and adds a logger per category override', () => {
    const loggers = buildLoggers('info', { 'client.keyboard': 'debug' });
    const base = loggers.find((l) => l.category.join('.') === 'anvika');
    const kb = loggers.find((l) => l.category.join('.') === 'anvika.client.keyboard');
    expect(base?.lowestLevel).toBe('info');
    expect(base?.sinks).toEqual(['console', 'file', 'latest']);
    expect(kb?.lowestLevel).toBe('debug');
  });

  it('maps a global off threshold to no sinks with parentSinks override (truly off)', () => {
    const loggers = buildLoggers('off', {});
    const base = loggers.find((l) => l.category.join('.') === 'anvika');
    expect(base?.sinks).toEqual([]);
    expect(base?.parentSinks).toBe('override');
  });

  it('maps a per-category off override to no sinks with parentSinks override', () => {
    const loggers = buildLoggers('info', { 'server.persistence': 'off' });
    const persistence = loggers.find((l) => l.category.join('.') === 'anvika.server.persistence');
    expect(persistence?.sinks).toEqual([]);
    expect(persistence?.parentSinks).toBe('override');
    const base = loggers.find((l) => l.category.join('.') === 'anvika');
    expect(base?.lowestLevel).toBe('info');
    expect(base?.sinks).toEqual(['console', 'file', 'latest']);
    expect(base?.parentSinks).toBeUndefined();
  });
});
