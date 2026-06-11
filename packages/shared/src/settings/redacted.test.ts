// packages/shared/src/settings/redacted.test.ts
import { describe, expect, expectTypeOf, it } from 'vitest';

import { CONNECTION_TYPES, type Connection } from './connection';
import { redactSecrets, type RedactedConnection, type RedactedSettings } from './redact';
import { RedactedConnectionSchema, RedactedSettingsSchema } from './redacted';
import { SettingsSchema } from './schema';

/** One plaintext connection per type, each WITH a stored secret. */
const withSecret: Connection[] = [
  {
    id: 'a',
    label: 'Anthropic',
    type: 'anthropic',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: 'sk-a',
  },
  {
    id: 'o',
    label: 'OpenAI',
    type: 'openai',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: 'sk-o',
  },
  {
    id: 'g',
    label: 'Google',
    type: 'google',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: 'sk-g',
  },
  {
    id: 'r',
    label: 'OpenRouter',
    type: 'openrouter',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: 'sk-r',
  },
  { id: 'x', label: 'xAI', type: 'xai', reasoningEffort: 'inherit', enabled: true, apiKey: 'sk-x' },
  {
    id: 'z',
    label: 'Azure',
    type: 'azure',
    reasoningEffort: 'inherit',
    enabled: true,
    apiKey: 'sk-z',
    resourceName: 'res',
  },
  {
    id: 'c',
    label: 'Compatible',
    type: 'openai-compatible',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    sendThinkingParams: true,
    apiKey: 'sk-c',
    headers: { 'x-extra': 'h' },
  },
];

/** Same types WITHOUT a stored secret (and openai-compatible without headers). */
const withoutSecret: Connection[] = [
  { id: 'a2', label: 'Anthropic', type: 'anthropic', reasoningEffort: 'inherit', enabled: true },
  { id: 'o2', label: 'OpenAI', type: 'openai', reasoningEffort: 'inherit', enabled: true },
  { id: 'g2', label: 'Google', type: 'google', reasoningEffort: 'inherit', enabled: true },
  { id: 'r2', label: 'OpenRouter', type: 'openrouter', reasoningEffort: 'inherit', enabled: true },
  { id: 'x2', label: 'xAI', type: 'xai', reasoningEffort: 'inherit', enabled: true },
  {
    id: 'z2',
    label: 'Azure',
    type: 'azure',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://r.openai.azure.com',
  },
  {
    id: 'c2',
    label: 'Compatible',
    type: 'openai-compatible',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    sendThinkingParams: true,
  },
];

describe('RedactedSettingsSchema round-trip', () => {
  it('parses the redactSecrets output for every connection type (secret set and unset)', () => {
    const settings = SettingsSchema.parse({ connections: [...withSecret, ...withoutSecret] });
    const redacted = redactSecrets(settings);
    const parsed = RedactedSettingsSchema.parse(redacted);
    expect(parsed).toEqual(redacted);
  });

  it('mirrors the projection exactly: parsed output deep-equals the redactSecrets output', () => {
    for (const connection of [...withSecret, ...withoutSecret]) {
      const settings = SettingsSchema.parse({ connections: [connection] });
      const redacted = redactSecrets(settings);
      expect(RedactedSettingsSchema.parse(redacted)).toEqual(redacted);
    }
  });
});

describe('RedactedConnectionSchema strictness / security', () => {
  it('REJECTS a leaked plaintext apiKey string (a secret-shaped response is not blindly accepted)', () => {
    const leaked = { id: 'a', label: 'A', type: 'anthropic', apiKey: 'sk-leaked' };
    expect(RedactedConnectionSchema.safeParse(leaked).success).toBe(false);
  });

  it('REJECTS plaintext string header values (headers must be { isSet })', () => {
    const leaked = {
      id: 'c',
      label: 'C',
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      headers: { 'x-extra': 'plaintext' },
    };
    expect(RedactedConnectionSchema.safeParse(leaked).success).toBe(false);
  });

  it('ACCEPTS the redacted shapes ({ isSet } for apiKey and header values)', () => {
    const ok = {
      id: 'c',
      label: 'C',
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: { isSet: true },
      headers: { 'x-extra': { isSet: true } },
    };
    expect(RedactedConnectionSchema.safeParse(ok).success).toBe(true);
  });
});

describe('anti-drift guards (derived union mirrors the plaintext union)', () => {
  it('covers every CONNECTION_TYPES member as a discriminant of the redacted union', () => {
    const accepted = CONNECTION_TYPES.filter((type) => {
      const base =
        type === 'openai-compatible'
          ? { id: 'i', label: 'L', type, baseUrl: 'https://api.example.com/v1' }
          : type === 'azure'
            ? { id: 'i', label: 'L', type, resourceName: 'res' }
            : { id: 'i', label: 'L', type };
      return RedactedConnectionSchema.safeParse(base).success;
    });
    expect(accepted).toEqual([...CONNECTION_TYPES]);
  });

  it('redacted variant apiKey is the { isSet } shape, never a plaintext string (type-level)', () => {
    type Anthropic = Extract<RedactedConnection, { type: 'anthropic' }>;
    expectTypeOf<Anthropic['apiKey']>().toEqualTypeOf<{ isSet: boolean } | undefined>();
    type Compat = Extract<RedactedConnection, { type: 'openai-compatible' }>;
    expectTypeOf<Compat['headers']>().toEqualTypeOf<
      Record<string, { isSet: boolean }> | undefined
    >();
  });

  it('RedactedSettings keeps the scalar fields from Settings verbatim', () => {
    expectTypeOf<RedactedSettings['sendKeyMode']>().toEqualTypeOf<'enter' | 'modEnter'>();
  });
});
