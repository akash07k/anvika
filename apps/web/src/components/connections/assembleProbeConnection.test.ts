import { describe, expect, it } from 'vitest';

import { assembleConnection } from './assembleProbeConnection';
import type { ConnectionDraft } from './connectionDraft';

/** Build a minimal openai-compatible draft for probe-shaping assertions. */
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

/** Read the headers map off an assembled connection for assertions. */
function headersOf(connection: ReturnType<typeof assembleConnection>): unknown {
  return (connection as { headers?: unknown }).headers;
}

describe('assembleConnection header shaping (add-flow test probe only)', () => {
  it('drops a named row with no typed value (Save would never persist it)', () => {
    // assembleConnection backs only the add-flow `{ connection }` test probe; add rows are isSet:false.
    // A name-only row (no value) never persists on Save, so the probe must not send it either (L-e).
    const draft = baseDraft({
      headers: [{ name: 'Authorization', isSet: false, value: undefined }],
    });
    expect(headersOf(assembleConnection(draft))).toBeUndefined();
  });

  it('drops a named row whose value is whitespace/empty while keeping a fully-typed header', () => {
    const draft = baseDraft({
      headers: [
        { name: 'X-Empty', isSet: false, value: '' },
        { name: 'Authorization', isSet: false, value: 'Bearer new' },
      ],
    });
    expect(headersOf(assembleConnection(draft))).toEqual({ Authorization: 'Bearer new' });
  });

  it('emits a freshly-typed header value as itself', () => {
    const draft = baseDraft({
      headers: [{ name: 'Authorization', isSet: false, value: 'Bearer new' }],
    });
    expect(headersOf(assembleConnection(draft))).toEqual({ Authorization: 'Bearer new' });
  });

  it('drops rows with an empty name', () => {
    const draft = baseDraft({
      headers: [
        { name: '', isSet: false, value: 'orphan' },
        { name: 'X-Keep', isSet: false, value: 'kept' },
      ],
    });
    expect(headersOf(assembleConnection(draft))).toEqual({ 'X-Keep': 'kept' });
  });

  it('omits headers entirely when no row has a non-empty name and value', () => {
    const draft = baseDraft({ headers: [{ name: '  ', isSet: false, value: 'x' }] });
    expect(headersOf(assembleConnection(draft))).toBeUndefined();
  });
});

describe('assembleConnection apiKey', () => {
  it('omits a clean apiKey', () => {
    const draft = baseDraft({ type: 'openai', apiKey: undefined, apiKeyDirty: false });
    expect((assembleConnection(draft) as { apiKey?: string }).apiKey).toBeUndefined();
  });

  it('includes a dirty apiKey', () => {
    const draft = baseDraft({ type: 'openai', apiKey: 'sk-typed', apiKeyDirty: true });
    expect((assembleConnection(draft) as { apiKey?: string }).apiKey).toBe('sk-typed');
  });
});
