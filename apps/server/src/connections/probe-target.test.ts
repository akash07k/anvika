import { describe, expect, it } from 'vitest';

import type { Connection } from '@anvika/shared/settings/connection';

import { probeTarget } from './probe-target';

/** Build a typed connection fixture for a given variant without widening to `Connection`. */
function conn<T extends Connection['type']>(c: Extract<Connection, { type: T }>): Connection {
  return c;
}

describe('probeTarget', () => {
  it('anthropic: default base, exact url, x-api-key + anthropic-version headers', () => {
    const target = probeTarget(
      conn({
        id: 'a',
        label: 'A',
        type: 'anthropic',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      }),
    );
    expect(target.url).toBe('https://api.anthropic.com/v1/models');
    expect(target.headers).toEqual({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01' });
  });

  it('anthropic: baseUrl override is honored', () => {
    const target = probeTarget(
      conn({
        id: 'a',
        label: 'A',
        type: 'anthropic',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
        baseUrl: 'https://proxy.test',
      }),
    );
    expect(target.url).toBe('https://proxy.test/v1/models');
  });

  it('openai: exact url, Bearer header', () => {
    const target = probeTarget(
      conn({
        id: 'o',
        label: 'O',
        type: 'openai',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'sk-x',
      }),
    );
    expect(target.url).toBe('https://api.openai.com/v1/models');
    expect(target.headers).toEqual({ Authorization: 'Bearer sk-x' });
  });

  it('google: key in query, empty headers', () => {
    const target = probeTarget(
      conn({
        id: 'g',
        label: 'G',
        type: 'google',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      }),
    );
    expect(target.url).toBe('https://generativelanguage.googleapis.com/v1beta/models?key=k');
    expect(target.headers).toEqual({});
  });

  it('google: reserved chars in the key are encodeURIComponent-encoded in the url', () => {
    const target = probeTarget(
      conn({
        id: 'g',
        label: 'G',
        type: 'google',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'a b&c=d',
      }),
    );
    expect(target.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models?key=a%20b%26c%3Dd',
    );
  });

  it('openrouter: fixed url, Bearer header', () => {
    const target = probeTarget(
      conn({
        id: 'r',
        label: 'R',
        type: 'openrouter',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      }),
    );
    expect(target.url).toBe('https://openrouter.ai/api/v1/models');
    expect(target.headers).toEqual({ Authorization: 'Bearer k' });
  });

  it('xai: exact url, Bearer header', () => {
    const target = probeTarget(
      conn({
        id: 'x',
        label: 'X',
        type: 'xai',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
      }),
    );
    expect(target.url).toBe('https://api.x.ai/v1/language-models');
    expect(target.headers).toEqual({ Authorization: 'Bearer k' });
  });

  it('openai-compatible: baseUrl + custom headers forwarded, Bearer added when key present', () => {
    const target = probeTarget(
      conn({
        id: 'c',
        label: 'C',
        type: 'openai-compatible',
        reasoningEffort: 'inherit',
        enabled: true,
        baseUrl: 'https://host',
        apiKey: 'k',
        headers: { 'x-custom': 'v' },
        sendThinkingParams: true,
      }),
    );
    expect(target.url).toBe('https://host/models');
    expect(target.headers).toEqual({ 'x-custom': 'v', Authorization: 'Bearer k' });
  });

  it('openai-compatible: no Authorization header when apiKey is absent', () => {
    const target = probeTarget(
      conn({
        id: 'c',
        label: 'C',
        type: 'openai-compatible',
        reasoningEffort: 'inherit',
        enabled: true,
        baseUrl: 'https://host',
        headers: { 'x-custom': 'v' },
        sendThinkingParams: true,
      }),
    );
    expect(target.headers).toEqual({ 'x-custom': 'v' });
  });

  it('azure: resourceName-only builds the default data-plane url, api-key header', () => {
    const target = probeTarget(
      conn({
        id: 'z',
        label: 'Z',
        type: 'azure',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
        resourceName: 'myres',
      }),
    );
    expect(target.url).toBe('https://myres.openai.azure.com/openai/models?api-version=2024-10-21');
    expect(target.headers).toEqual({ 'api-key': 'k' });
  });

  it('azure: explicit baseUrl overrides the resourceName template', () => {
    const target = probeTarget(
      conn({
        id: 'z',
        label: 'Z',
        type: 'azure',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
        resourceName: 'myres',
        baseUrl: 'https://custom.azure.test',
      }),
    );
    expect(target.url).toBe('https://custom.azure.test/openai/models?api-version=2024-10-21');
  });

  it('azure: explicit apiVersion overrides the default, encoded in the query', () => {
    const target = probeTarget(
      conn({
        id: 'z',
        label: 'Z',
        type: 'azure',
        reasoningEffort: 'inherit',
        enabled: true,
        apiKey: 'k',
        resourceName: 'myres',
        apiVersion: '2025-01-01 preview',
      }),
    );
    expect(target.url).toBe(
      'https://myres.openai.azure.com/openai/models?api-version=2025-01-01%20preview',
    );
  });
});
