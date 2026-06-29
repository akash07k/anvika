import { describe, expect, it } from 'vitest';

import type { RedactedConnection } from '@anvika/shared/settings/redact';

import {
  assemblePublicConnection,
  assembleSecretPatch,
  draftFromExisting,
  emptyDraft,
  validateDraft,
  type ConnectionDraft,
} from './connectionDraft';

/** Build a minimal openai-compatible draft for header-shaping assertions. */
function baseDraft(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    type: 'openai-compatible',
    id: 'c',
    idEdited: true,
    label: 'C',
    baseUrl: 'https://x.test',
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

describe('assemblePublicConnection', () => {
  it('omits apiKey and headers, keeping public fields', () => {
    const draft = baseDraft({
      apiKey: 'sk-typed',
      apiKeyDirty: true,
      headers: [{ name: 'Authorization', isSet: false, value: 'Bearer new' }],
    });
    const pub = assemblePublicConnection(draft);
    expect(pub).not.toHaveProperty('apiKey');
    expect(pub).not.toHaveProperty('headers');
    expect((pub as { baseUrl?: string }).baseUrl).toBe('https://x.test');
    expect(JSON.stringify(pub)).not.toContain('sk-typed');
    expect(JSON.stringify(pub)).not.toContain('Bearer');
  });

  it('includes trimmed manualModelIds when present', () => {
    const draft = baseDraft({ manualModelIds: [' gpt-4 ', '', '  '] });
    expect(
      (assemblePublicConnection(draft) as { manualModelIds?: string[] }).manualModelIds,
    ).toEqual(['gpt-4']);
  });
});

/** A redacted edit target with a stored key and one stored header. */
function existingVenice(): RedactedConnection {
  return {
    id: 'venice',
    type: 'openai-compatible',
    label: 'Venice',
    reasoningEffort: 'inherit',
    enabled: true,
    baseUrl: 'https://x.test',
    sendThinkingParams: true,
    apiKey: { isSet: true },
    headers: { Authorization: { isSet: true } },
  };
}

describe('assemblePublicConnection enabled flag', () => {
  it('defaults enabled to true on add', () => {
    const draft = emptyDraft('openai-compatible');
    draft.id = 'local';
    draft.label = 'Local';
    draft.baseUrl = 'http://localhost:1234';
    expect(assemblePublicConnection(draft).enabled).toBe(true);
  });

  it('preserves the existing enabled flag on edit', () => {
    const existing: RedactedConnection = {
      id: 'local',
      type: 'openai-compatible',
      label: 'Local',
      enabled: false,
      reasoningEffort: 'inherit',
      baseUrl: 'http://localhost:1234',
      sendThinkingParams: true,
      apiKey: { isSet: true },
    };
    const draft = draftFromExisting(existing);
    expect(assemblePublicConnection(draft, existing).enabled).toBe(false);
  });
});

describe('assembleSecretPatch', () => {
  it('returns null when nothing secret changed (untouched key and headers)', () => {
    const draft = baseDraft({
      apiKey: undefined,
      apiKeyDirty: false,
      headers: [{ name: 'Authorization', isSet: true, value: undefined }],
    });
    expect(assembleSecretPatch(draft, existingVenice())).toBeNull();
  });

  it('sets a re-typed apiKey', () => {
    const draft = baseDraft({ apiKey: 'sk-new', apiKeyDirty: true });
    expect(assembleSecretPatch(draft)).toEqual({ apiKey: 'sk-new' });
  });

  it('sets a newly-typed header value', () => {
    const draft = baseDraft({
      headers: [{ name: 'X-Token', isSet: false, value: 'tok' }],
    });
    expect(assembleSecretPatch(draft)).toEqual({ headers: { 'X-Token': 'tok' } });
  });

  it('clears a header present in existing but removed from the draft', () => {
    const draft = baseDraft({ headers: [] });
    expect(assembleSecretPatch(draft, existingVenice())).toEqual({
      headers: { Authorization: null },
    });
  });

  it('keeps an untouched isSet header unchanged (absent from the patch)', () => {
    const draft = baseDraft({
      headers: [{ name: 'Authorization', isSet: true, value: undefined }],
    });
    expect(assembleSecretPatch(draft, existingVenice())).toBeNull();
  });

  it('renaming a header without re-entering its value clears the old name (caveat pin)', () => {
    // The row was renamed Authorization -> X-Auth but no new value was typed. The client holds only
    // the write-only { isSet } marker, so it cannot move the secret: the old name is cleared and the
    // new name has no value to set. Re-entering the value is the documented way to rename a header.
    const draft = baseDraft({
      headers: [{ name: 'X-Auth', isSet: true, value: undefined }],
    });
    expect(assembleSecretPatch(draft, existingVenice())).toEqual({
      headers: { Authorization: null },
    });
  });
});

describe('validateDraft', () => {
  it('passes for a keyless openai-compatible draft with a baseUrl', () => {
    const draft = baseDraft({ baseUrl: 'https://x.test', apiKey: undefined, apiKeyDirty: false });
    expect(validateDraft(draft).success).toBe(true);
  });

  it('fails without a baseUrl for openai-compatible', () => {
    const draft = baseDraft({ baseUrl: '' });
    expect(validateDraft(draft).success).toBe(false);
  });
});

describe('sendThinkingParams draft round-trip', () => {
  it('defaults sendThinkingParams to true in an empty openai-compatible draft', () => {
    expect(emptyDraft('openai-compatible').sendThinkingParams).toBe(true);
  });

  it('round-trips sendThinkingParams=false for an openai-compatible draft', () => {
    const draft: ConnectionDraft = {
      ...emptyDraft('openai-compatible'),
      id: 'local',
      label: 'Local',
      baseUrl: 'http://localhost:5001/v1',
      sendThinkingParams: false,
    };
    const pub = assemblePublicConnection(draft);
    const oac = pub as { type: string; sendThinkingParams?: boolean };
    expect(oac.type).toBe('openai-compatible');
    expect(oac.sendThinkingParams).toBe(false);
    expect(validateDraft(draft).success).toBe(true);
  });
});
