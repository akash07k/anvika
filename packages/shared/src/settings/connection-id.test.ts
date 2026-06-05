// packages/shared/src/settings/connection-id.test.ts
import { describe, expect, it } from 'vitest';

import { deriveConnectionId, slugifyConnectionId } from './connection-id';

describe('slugifyConnectionId', () => {
  it('lowercases, replaces runs of non-slug chars with single hyphens, trims hyphens', () => {
    expect(slugifyConnectionId('My Work Azure!')).toBe('my-work-azure');
    expect(slugifyConnectionId('  Personal  ')).toBe('personal');
    expect(slugifyConnectionId('a__b--c')).toBe('a-b-c');
  });

  it('returns empty string when there are no slug-able characters', () => {
    expect(slugifyConnectionId('工作')).toBe('');
    expect(slugifyConnectionId('🚀')).toBe('');
  });
});

describe('deriveConnectionId', () => {
  it('derives from the label when it slugifies', () => {
    expect(deriveConnectionId('OpenAI', 'openai', [])).toBe('openai');
  });

  it('falls back to type + numeric suffix when the label has no slug', () => {
    expect(deriveConnectionId('🚀', 'azure', [])).toBe('azure-1');
  });

  it('adds the lowest free numeric suffix to avoid collisions', () => {
    expect(deriveConnectionId('OpenAI', 'openai', ['openai'])).toBe('openai-1');
    expect(deriveConnectionId('OpenAI', 'openai', ['openai', 'openai-1'])).toBe('openai-2');
  });
});
