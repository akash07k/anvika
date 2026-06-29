import { describe, expect, it } from 'vitest';

import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { RedactedConnection } from '@anvika/shared/settings/redact';

import { optimisticConnections, readHeaders } from './connectionsWire';

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

describe('optimisticConnections', () => {
  it('appends with apiKey { isSet: false } on add', () => {
    const out = optimisticConnections([openai()], {
      id: 'n',
      type: 'openai',
      label: 'N',
      reasoningEffort: 'inherit',
      enabled: true,
    });
    expect(out).toHaveLength(2);
    expect(out[1]?.id).toBe('n');
    expect(out[1]?.apiKey).toEqual({ isSet: false });
    expect(out[1]).not.toHaveProperty('headers');
  });

  it('replaces the same-id projection on edit, preserving prior isSet flags', () => {
    const out = optimisticConnections([venice()], {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice Pro',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://v/v2',
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.label).toBe('Venice Pro');
    // Prior secret isSet flags are preserved (the secret PUT reconcile corrects them later).
    expect(out[0]?.apiKey).toEqual({ isSet: true });
    const headers = out[0] ? readHeaders(out[0]) : undefined;
    expect(headers).toEqual({ Authorization: { isSet: true } });
  });

  // In-flight secret patch: apiKey and headers isSet flags reflect the save immediately.

  it('EDIT setting a new apiKey: prior isSet false, secret string -> isSet true, no plaintext', () => {
    const prior = { ...openai(), apiKey: { isSet: false } } satisfies RedactedConnection;
    const changed: PublicConnection = {
      id: 'openai',
      type: 'openai',
      label: 'OpenAI',
      reasoningEffort: 'inherit',
      enabled: true,
    };
    const out = optimisticConnections([prior], changed, {
      apiKey: 'sk-x',
    } satisfies SetConnectionSecret);
    expect(out[0]?.apiKey).toEqual({ isSet: true });
    expect(JSON.stringify(out)).not.toContain('sk-x');
  });

  it('EDIT clearing the apiKey: prior isSet true, secret null -> isSet false', () => {
    const changed: PublicConnection = {
      id: 'openai',
      type: 'openai',
      label: 'OpenAI',
      reasoningEffort: 'inherit',
      enabled: true,
    };
    const out = optimisticConnections([openai()], changed, {
      apiKey: null,
    } satisfies SetConnectionSecret);
    expect(out[0]?.apiKey).toEqual({ isSet: false });
  });

  it('EDIT adding a header: prior has Authorization, secret adds X-New -> both present, no plaintext', () => {
    const changed: PublicConnection = {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://venice.example/v1',
    };
    const out = optimisticConnections([venice()], changed, {
      headers: { 'X-New': 'v' },
    } satisfies SetConnectionSecret);
    const headers = out[0] ? readHeaders(out[0]) : undefined;
    expect(headers).toEqual({ Authorization: { isSet: true }, 'X-New': { isSet: true } });
    expect(JSON.stringify(out)).not.toContain('"v"');
  });

  it('EDIT removing a header: prior has Authorization + X-Old, secret null clears X-Old', () => {
    const prior: RedactedConnection = {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://venice.example/v1',
      sendThinkingParams: true,
      apiKey: { isSet: true },
      headers: { Authorization: { isSet: true }, 'X-Old': { isSet: true } },
    };
    const changed: PublicConnection = {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://venice.example/v1',
    };
    const out = optimisticConnections([prior], changed, {
      headers: { 'X-Old': null },
    } satisfies SetConnectionSecret);
    const headers = out[0] ? readHeaders(out[0]) : undefined;
    expect(headers).toEqual({ Authorization: { isSet: true } });
    expect(headers).not.toHaveProperty('X-Old');
  });

  it('EDIT with no secret: prior isSet flags preserved unchanged (regression guard)', () => {
    const changed: PublicConnection = {
      id: 'venice',
      type: 'openai-compatible',
      label: 'Venice Updated',
      reasoningEffort: 'inherit',
      enabled: true,
      baseUrl: 'https://venice.example/v1',
    };
    const out = optimisticConnections([venice()], changed);
    expect(out[0]?.apiKey).toEqual({ isSet: true });
    expect(out[0] ? readHeaders(out[0]) : undefined).toEqual({ Authorization: { isSet: true } });
  });

  it('ADD with a secret: no prior, secret apiKey string -> isSet true, no plaintext', () => {
    const changed: PublicConnection = {
      id: 'new-conn',
      type: 'openai',
      label: 'New',
      reasoningEffort: 'inherit',
      enabled: true,
    };
    const out = optimisticConnections([], changed, {
      apiKey: 'sk-x',
    } satisfies SetConnectionSecret);
    expect(out[0]?.apiKey).toEqual({ isSet: true });
    expect(JSON.stringify(out)).not.toContain('sk-x');
  });
});
