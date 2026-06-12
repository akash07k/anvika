import { describe, expect, it } from 'vitest';

import type { ConnectionDiscoveryStatus } from '@anvika/shared/models/contracts';

import { discoveryStatusMessage, isLoadProblem } from './discoveryStatusMessage';

type Outcome = ConnectionDiscoveryStatus['outcome'];

describe('discoveryStatusMessage', () => {
  it('tailors the local unreachable message with the base URL', () => {
    expect(
      discoveryStatusMessage('openai-compatible', 'unreachable', 'Local', 'http://localhost:1234'),
    ).toBe('Could not reach your local server at http://localhost:1234. Is it running?');
  });
  it('uses the label for a non-local unreachable', () => {
    expect(discoveryStatusMessage('openrouter', 'unreachable', 'OpenRouter')).toBe(
      'Could not reach OpenRouter.',
    );
  });
  it('reports an unauthorized key', () => {
    expect(discoveryStatusMessage('openai', 'unauthorized', 'OpenAI')).toBe(
      'OpenAI: the API key was rejected.',
    );
  });
  it('reports a generic error', () => {
    expect(discoveryStatusMessage('google', 'error', 'Gemini')).toBe(
      'Gemini: could not load models.',
    );
  });
  it('gives a local-only reachable-but-empty hint', () => {
    expect(discoveryStatusMessage('openai-compatible', 'empty', 'Local')).toBe(
      'Local is reachable but has no models loaded.',
    );
    expect(discoveryStatusMessage('openrouter', 'empty', 'OpenRouter')).toBeNull();
  });
  it('returns null for ok', () => {
    expect(discoveryStatusMessage('openai', 'ok', 'OpenAI')).toBeNull();
  });
  it('isLoadProblem is true only for unreachable/unauthorized/error', () => {
    const problems: Outcome[] = ['unreachable', 'unauthorized', 'error'];
    const nonproblems: Outcome[] = ['ok', 'empty'];
    expect(problems.every(isLoadProblem)).toBe(true);
    expect(nonproblems.some(isLoadProblem)).toBe(false);
  });
});
