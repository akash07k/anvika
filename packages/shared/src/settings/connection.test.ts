// packages/shared/src/settings/connection.test.ts
import { describe, expect, it } from 'vitest';

import { ConnectionSchema, ConnectionsSchema } from './connection';
import { RedactedConnectionSchema } from './redacted';

const anthropic = { id: 'work', label: 'Work', type: 'anthropic', apiKey: 'sk-x' };

describe('ConnectionSchema', () => {
  it('accepts a valid anthropic connection with an optional baseUrl', () => {
    expect(ConnectionSchema.safeParse(anthropic).success).toBe(true);
    expect(
      ConnectionSchema.safeParse({ ...anthropic, baseUrl: 'https://proxy.example/v1' }).success,
    ).toBe(true);
  });

  it('requires baseUrl for openai-compatible and allows secret header values', () => {
    expect(
      ConnectionSchema.safeParse({ id: 'venice', label: 'Venice', type: 'openai-compatible' })
        .success,
    ).toBe(false);
    expect(
      ConnectionSchema.safeParse({
        id: 'venice',
        label: 'Venice',
        type: 'openai-compatible',
        baseUrl: 'https://api.venice.ai/api/v1',
        headers: { 'x-extra': 'secret-value' },
      }).success,
    ).toBe(true);
  });

  it('rejects an openai-compatible header with an empty-string key (non-empty key passes)', () => {
    const base = {
      id: 'venice',
      label: 'Venice',
      type: 'openai-compatible',
      baseUrl: 'https://api.venice.ai/api/v1',
    };
    expect(ConnectionSchema.safeParse({ ...base, headers: { '': 'v' } }).success).toBe(false);
    expect(ConnectionSchema.safeParse({ ...base, headers: { 'x-extra': 'v' } }).success).toBe(true);
  });

  it('requires resourceName or baseUrl for azure', () => {
    expect(
      ConnectionSchema.safeParse({ id: 'az', label: 'Az', type: 'azure', apiKey: 'k' }).success,
    ).toBe(false);
    expect(
      ConnectionSchema.safeParse({
        id: 'az',
        label: 'Az',
        type: 'azure',
        apiKey: 'k',
        resourceName: 'my-res',
      }).success,
    ).toBe(true);
  });

  it('rejects an id with a colon or out-of-charset characters', () => {
    expect(ConnectionSchema.safeParse({ ...anthropic, id: 'a:b' }).success).toBe(false);
    expect(ConnectionSchema.safeParse({ ...anthropic, id: 'Work' }).success).toBe(false);
    expect(ConnectionSchema.safeParse({ ...anthropic, id: '' }).success).toBe(false);
  });
});

describe('connection enabled flag', () => {
  const base = {
    id: 'local',
    type: 'openai-compatible',
    label: 'Local',
    baseUrl: 'http://localhost:1234',
  };

  it('defaults enabled to true when omitted', () => {
    const parsed = ConnectionSchema.parse(base);
    expect(parsed.enabled).toBe(true);
  });

  it('accepts an explicit enabled: false', () => {
    expect(ConnectionSchema.parse({ ...base, enabled: false }).enabled).toBe(false);
  });

  it('flows enabled through the redacted variant', () => {
    const redacted = RedactedConnectionSchema.parse({ ...base, enabled: false });
    expect(redacted.enabled).toBe(false);
  });
});

describe('openai-compatible sendThinkingParams', () => {
  const base = {
    id: 'local',
    label: 'Local',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:5001/v1',
  };

  it('defaults openai-compatible sendThinkingParams to true', () => {
    const c = ConnectionSchema.parse(base);
    expect(c.type === 'openai-compatible' && c.sendThinkingParams).toBe(true);
  });

  it('accepts sendThinkingParams=false on an openai-compatible connection', () => {
    const c = ConnectionSchema.parse({ ...base, sendThinkingParams: false });
    expect(c.type === 'openai-compatible' && c.sendThinkingParams).toBe(false);
  });

  it('flows sendThinkingParams through the redacted variant', () => {
    const redacted = RedactedConnectionSchema.parse({ ...base, sendThinkingParams: false });
    expect(redacted.type === 'openai-compatible' && redacted.sendThinkingParams).toBe(false);
  });
});

describe('ConnectionsSchema', () => {
  it('rejects duplicate ids', () => {
    const dup = ConnectionsSchema.safeParse([anthropic, { ...anthropic, label: 'Other' }]);
    expect(dup.success).toBe(false);
  });

  it('accepts distinct ids and defaults to an empty array', () => {
    expect(ConnectionsSchema.safeParse([anthropic, { ...anthropic, id: 'home' }]).success).toBe(
      true,
    );
    expect(ConnectionsSchema.parse(undefined)).toEqual([]);
  });
});
