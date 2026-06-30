import { describe, expect, it } from 'vitest';

import type { Connection } from '@anvika/shared/settings/connection';

import { applyConnectionSecret } from './secret-apply';

const anthropic: Connection = {
  id: 'a',
  label: 'A',
  type: 'anthropic',
  reasoningEffort: 'inherit',
  enabled: true,
  apiKey: 'sk-old',
};

const compat: Connection = {
  id: 'c',
  label: 'C',
  type: 'openai-compatible',
  reasoningEffort: 'inherit',
  enabled: true,
  baseUrl: 'https://x/v1',
  headers: { 'x-one': '1', 'x-two': '2' },
  sendThinkingParams: true,
};

describe('applyConnectionSecret', () => {
  it('keeps the existing apiKey when apiKey is omitted', () => {
    const result = applyConnectionSecret(anthropic, {});
    expect(result).toHaveProperty('apiKey', 'sk-old');
  });

  it('sets a new apiKey from a string', () => {
    const result = applyConnectionSecret(anthropic, { apiKey: 'sk-new' });
    expect(result).toHaveProperty('apiKey', 'sk-new');
  });

  it('clears the apiKey field when apiKey is null', () => {
    const result = applyConnectionSecret(anthropic, { apiKey: null });
    expect(result).not.toHaveProperty('apiKey');
  });

  it('sets a new header, keeping the others', () => {
    const result = applyConnectionSecret(compat, { headers: { 'x-three': '3' } });
    expect(result).toHaveProperty('headers', { 'x-one': '1', 'x-two': '2', 'x-three': '3' });
  });

  it('clears one header, keeping the others', () => {
    const result = applyConnectionSecret(compat, { headers: { 'x-one': null } });
    expect(result).toHaveProperty('headers', { 'x-two': '2' });
  });

  it('drops the whole headers field when the last header is cleared', () => {
    const result = applyConnectionSecret(compat, {
      headers: { 'x-one': null, 'x-two': null },
    });
    expect(result).not.toHaveProperty('headers');
  });

  it('returns an equal connection for an empty patch', () => {
    expect(applyConnectionSecret(compat, {})).toEqual(compat);
  });

  it('does not mutate the input connection', () => {
    const before = structuredClone(compat);
    applyConnectionSecret(compat, { headers: { 'x-one': null }, apiKey: 'sk-x' });
    expect(compat).toEqual(before);
  });
});
