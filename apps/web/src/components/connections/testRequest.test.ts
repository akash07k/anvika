import { describe, expect, it } from 'vitest';

import type { RedactedConnection } from '@anvika/shared/settings/redact';

import type { ConnectionDraft } from './connectionDraft';
import { testRequestFor } from './testRequest';

/** Build a minimal openai-compatible draft for request-shaping assertions. */
function baseDraft(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    type: 'openai-compatible',
    id: 'venice',
    idEdited: true,
    label: 'Venice',
    baseUrl: 'https://x.test/v1',
    resourceName: '',
    apiVersion: '',
    apiKey: undefined,
    apiKeyDirty: false,
    headers: [],
    manualModelIds: [],
    sendThinkingParams: true,
    reasoningEffort: 'inherit',
    ...overrides,
  };
}

/** A redacted edit target whose stored baseUrl matches the base draft. */
function existing(): RedactedConnection {
  return {
    id: 'venice',
    type: 'openai-compatible',
    label: 'Venice',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://x.test/v1',
    sendThinkingParams: true,
    apiKey: { isSet: true },
  };
}

describe('testRequestFor', () => {
  it('add mode returns the full assembled connection', () => {
    const req = testRequestFor(baseDraft(), 'add');
    expect(req).toHaveProperty('connection');
    expect((req as { connection: { id: string } }).connection.id).toBe('venice');
  });

  it('edit mode with only a changed baseUrl returns config and no override', () => {
    const draft = baseDraft({ baseUrl: 'https://new.test/v1' });
    const req = testRequestFor(draft, 'edit', existing()) as {
      connectionId: string;
      override?: unknown;
      config?: { baseUrl?: string };
    };
    expect(req.connectionId).toBe('venice');
    expect(req.config).toEqual({ baseUrl: 'https://new.test/v1' });
    expect(req).not.toHaveProperty('override');
  });

  it('edit mode with a re-typed key and a changed baseUrl returns both override and config', () => {
    const draft = baseDraft({
      baseUrl: 'https://new.test/v1',
      apiKey: 'sk-new',
      apiKeyDirty: true,
    });
    const req = testRequestFor(draft, 'edit', existing()) as {
      connectionId: string;
      override?: { apiKey?: string };
      config?: { baseUrl?: string };
    };
    expect(req.override?.apiKey).toBe('sk-new');
    expect(req.config).toEqual({ baseUrl: 'https://new.test/v1' });
  });

  it('edit mode with no changes returns connectionId only (no override, no config)', () => {
    const req = testRequestFor(baseDraft(), 'edit', existing());
    expect(req).toEqual({ connectionId: 'venice' });
  });
});
