import { describe, expect, it } from 'vitest';

import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { RedactedConnection } from '@anvika/shared/settings/redact';

import {
  buildConnectionsPatch,
  modelBelongsToConnection,
  parseConnectionId,
  redactedToPublic,
} from './connectionsWire';

/** A redacted openai-compatible sibling with a stored key and one stored header. */
function venice(): RedactedConnection {
  return {
    id: 'venice',
    type: 'openai-compatible',
    label: 'Venice',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://venice.example/v1',
    sendThinkingParams: true,
    apiKey: { isSet: true },
    headers: { Authorization: { isSet: true } },
  };
}

/** A redacted native-key sibling with a stored key and no headers. */
function openai(): RedactedConnection {
  return {
    id: 'openai',
    type: 'openai',
    label: 'OpenAI',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: { isSet: true },
  };
}

describe('redactedToPublic', () => {
  it('drops apiKey and headers entirely, keeping public fields', () => {
    const wire = redactedToPublic(venice());
    expect(wire).not.toHaveProperty('apiKey');
    expect(wire).not.toHaveProperty('headers');
    expect(wire.type).toBe('openai-compatible');
    expect((wire as { baseUrl?: string }).baseUrl).toBe('https://venice.example/v1');
  });

  it('copies non-secret fields and omits headers when there are none', () => {
    const wire = redactedToPublic(openai());
    expect(wire.id).toBe('openai');
    expect(wire.label).toBe('OpenAI');
    expect(wire).not.toHaveProperty('apiKey');
    expect(wire).not.toHaveProperty('headers');
  });

  it('passes through manualModelIds when present and non-empty', () => {
    const wire = redactedToPublic({ ...openai(), manualModelIds: ['gpt-4'] });
    expect((wire as { manualModelIds?: string[] }).manualModelIds).toEqual(['gpt-4']);
  });
});

describe('buildConnectionsPatch', () => {
  const changed: PublicConnection = {
    id: 'new-one',
    type: 'openai',
    label: 'New One',
    reasoningEffort: 'inherit',
    enabled: true,
  };

  it('appends on add and projects every sibling as public (no secrets anywhere)', () => {
    const out = buildConnectionsPatch([venice(), openai()], changed);
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual(changed);
    expect(out[0]).not.toHaveProperty('apiKey');
    expect(out[0]).not.toHaveProperty('headers');
    expect(out[1]).not.toHaveProperty('apiKey');
    // No secret field name survives anywhere in the serialized patch.
    expect(JSON.stringify(out)).not.toContain('apiKey');
    expect(JSON.stringify(out)).not.toContain('headers');
  });

  it('replaces by id on edit and keeps the other siblings public', () => {
    const edited: PublicConnection = {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice Pro',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://venice.example/v2',
    };
    const out = buildConnectionsPatch([venice(), openai()], edited);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(edited);
    expect(out[1]).not.toHaveProperty('apiKey');
    expect(JSON.stringify(out)).not.toContain('apiKey');
  });

  it('removes by id when changed is null and projects the rest as public', () => {
    const out = buildConnectionsPatch([venice(), openai()], null, 'venice');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('openai');
    expect(JSON.stringify(out)).not.toContain('apiKey');
    expect(JSON.stringify(out)).not.toContain('headers');
  });
});

describe('parseConnectionId', () => {
  it('returns the substring before the first colon', () => {
    expect(parseConnectionId('venice:llama-3')).toBe('venice');
    expect(parseConnectionId('venice:ns:model')).toBe('venice');
  });

  it('returns "" for a colonless id or an empty string', () => {
    expect(parseConnectionId('foo')).toBe('');
    expect(parseConnectionId('')).toBe('');
    expect(parseConnectionId(':leading')).toBe('');
  });

  it('rejects a trailing colon, fully mirroring the server parseModelId', () => {
    // `work:` has an empty model after the colon; parseModelId returns null, so this must return ''.
    expect(parseConnectionId('work:')).toBe('');
    expect(parseConnectionId('venice:llama-3')).toBe('venice');
  });
});

describe('redactedToPublic enabled flag', () => {
  it('redactedToPublic carries the enabled flag when false', () => {
    const redacted: RedactedConnection = {
      id: 'local',
      type: 'openai-compatible',
      label: 'Local',
      enabled: false,
      reasoningEffort: 'inherit',
      baseUrl: 'http://localhost:1',
      sendThinkingParams: true,
      apiKey: { isSet: true },
    };
    expect(redactedToPublic(redacted).enabled).toBe(false);
  });

  it('buildConnectionsPatch preserves each sibling enabled flag', () => {
    const a: RedactedConnection = {
      id: 'a',
      type: 'openai-compatible',
      label: 'A',
      enabled: false,
      reasoningEffort: 'inherit',
      baseUrl: 'http://x',
      sendThinkingParams: true,
      apiKey: { isSet: false },
    };
    const changed: PublicConnection = {
      id: 'b',
      type: 'openai',
      label: 'B',
      reasoningEffort: 'inherit',
      enabled: true,
    };
    const patch = buildConnectionsPatch([a], changed);
    expect(patch.find((c) => c.id === 'a')?.enabled).toBe(false);
  });
});

describe('modelBelongsToConnection', () => {
  it('matches when the model id prefix equals the connection id', () => {
    expect(modelBelongsToConnection('venice:llama-3', 'venice')).toBe(true);
  });

  it('does not match a different connection or an empty selection', () => {
    expect(modelBelongsToConnection('openai:gpt-4', 'venice')).toBe(false);
    expect(modelBelongsToConnection('', 'venice')).toBe(false);
  });

  it('does not match a colonless id even when it equals the connection id', () => {
    // A bare id has no connection prefix; it must not spuriously match (parity with parseModelId).
    expect(modelBelongsToConnection('venice', 'venice')).toBe(false);
  });

  it('does not match a trailing-colon id (empty model, parity with parseModelId)', () => {
    expect(modelBelongsToConnection('work:', 'work')).toBe(false);
  });
});
