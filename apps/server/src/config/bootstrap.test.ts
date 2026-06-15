import { describe, expect, it } from 'vitest';

import { resolveBootstrapConfig, resolveLogConfig } from './bootstrap';

describe('resolveBootstrapConfig', () => {
  it('uses defaults when nothing is provided', () => {
    const cfg = resolveBootstrapConfig({ flags: {}, env: {} });
    expect(cfg.port).toBe(7800);
    expect(cfg.open).toBe(true);
  });

  it('lets the port flag override the default', () => {
    const cfg = resolveBootstrapConfig({ flags: { port: '9000' }, env: {} });
    expect(cfg.port).toBe(9000);
  });

  it('reads ANVIKA_PORT from env when no flag is given', () => {
    const cfg = resolveBootstrapConfig({ flags: {}, env: { ANVIKA_PORT: '8123' } });
    expect(cfg.port).toBe(8123);
  });

  it('treats --no-open as open=false', () => {
    const cfg = resolveBootstrapConfig({ flags: { open: false }, env: {} });
    expect(cfg.open).toBe(false);
  });

  it('passes through the data-dir flag and env', () => {
    const cfg = resolveBootstrapConfig({
      flags: { dataDir: '/x' },
      env: { ANVIKA_DATA_DIR: '/y' },
    });
    expect(cfg.dataDirFlag).toBe('/x');
    expect(cfg.dataDirEnv).toBe('/y');
  });

  it('throws on a non-numeric ANVIKA_PORT', () => {
    expect(() => resolveBootstrapConfig({ flags: {}, env: { ANVIKA_PORT: 'abc' } })).toThrow(
      /ANVIKA_PORT/,
    );
  });

  it('throws on an out-of-range port flag', () => {
    expect(() => resolveBootstrapConfig({ flags: { port: '70000' }, env: {} })).toThrow(/--port/);
  });

  it('rejects a port flag with a trailing non-numeric suffix', () => {
    expect(() => resolveBootstrapConfig({ flags: { port: '123abc' }, env: {} })).toThrow(/--port/);
  });

  it('rejects ANVIKA_PORT with a trailing non-numeric suffix', () => {
    expect(() => resolveBootstrapConfig({ flags: {}, env: { ANVIKA_PORT: '8080extra' } })).toThrow(
      /ANVIKA_PORT/,
    );
  });
});

describe('resolveBootstrapConfig logContent', () => {
  const base = { flags: {}, env: {} as Record<string, string | undefined> };

  it('defaults logContent to false', () => {
    expect(resolveBootstrapConfig(base).logContent).toBe(false);
  });

  it('enables logContent from the --log-content flag', () => {
    expect(resolveBootstrapConfig({ flags: { logContent: true }, env: {} }).logContent).toBe(true);
  });

  it('enables logContent from ANVIKA_LOG_CONTENT=1 or true (case-insensitive)', () => {
    expect(resolveBootstrapConfig({ flags: {}, env: { ANVIKA_LOG_CONTENT: '1' } }).logContent).toBe(
      true,
    );
    expect(
      resolveBootstrapConfig({ flags: {}, env: { ANVIKA_LOG_CONTENT: 'TRUE' } }).logContent,
    ).toBe(true);
  });

  it('treats other ANVIKA_LOG_CONTENT values as off', () => {
    expect(resolveBootstrapConfig({ flags: {}, env: { ANVIKA_LOG_CONTENT: '0' } }).logContent).toBe(
      false,
    );
    expect(
      resolveBootstrapConfig({ flags: {}, env: { ANVIKA_LOG_CONTENT: 'no' } }).logContent,
    ).toBe(false);
  });

  it('lets the flag take precedence over the env', () => {
    expect(
      resolveBootstrapConfig({ flags: { logContent: true }, env: { ANVIKA_LOG_CONTENT: '0' } })
        .logContent,
    ).toBe(true);
  });
});

describe('resolveLogConfig', () => {
  it('defaults to info with no overrides', () => {
    const cfg = resolveLogConfig({ flags: {}, env: {} });
    expect(cfg.level).toBe('info');
    expect(cfg.categories).toEqual({});
  });

  it('takes the flag level over env over default', () => {
    expect(
      resolveLogConfig({ flags: { logLevel: 'debug' }, env: { ANVIKA_LOG_LEVEL: 'warning' } })
        .level,
    ).toBe('debug');
    expect(resolveLogConfig({ flags: {}, env: { ANVIKA_LOG_LEVEL: 'warning' } }).level).toBe(
      'warning',
    );
  });

  it('parses repeatable per-category overrides from the flag and env', () => {
    const cfg = resolveLogConfig({
      flags: { logCategory: ['client.keyboard=debug'] },
      env: { ANVIKA_LOG_CATEGORIES: 'client.focus=trace' },
    });
    expect(cfg.categories).toEqual({ 'client.keyboard': 'debug', 'client.focus': 'trace' });
  });

  it('fails fast on an invalid level', () => {
    expect(() => resolveLogConfig({ flags: { logLevel: 'loud' }, env: {} })).toThrow(/--log-level/);
  });

  it('fails fast on a malformed category override', () => {
    expect(() =>
      resolveLogConfig({ flags: { logCategory: ['client.keyboard'] }, env: {} }),
    ).toThrow(/--log-category/);
  });
});

describe('resolveBootstrapConfig log', () => {
  it('defaults log.level to info', () => {
    expect(resolveBootstrapConfig({ flags: {}, env: {} }).log.level).toBe('info');
  });
});

describe('resolveLogConfig off threshold', () => {
  it('accepts off as the global level', () => {
    expect(resolveLogConfig({ flags: { logLevel: 'off' }, env: {} }).level).toBe('off');
    expect(resolveLogConfig({ flags: {}, env: { ANVIKA_LOG_LEVEL: 'off' } }).level).toBe('off');
  });

  it('accepts off as a per-category override', () => {
    const cfg = resolveLogConfig({
      flags: { logCategory: ['server.persistence=off'] },
      env: {},
    });
    expect(cfg.categories).toEqual({ 'server.persistence': 'off' });
  });

  it('still rejects an unknown level', () => {
    expect(() => resolveLogConfig({ flags: { logLevel: 'loud' }, env: {} })).toThrow(/--log-level/);
  });
});
