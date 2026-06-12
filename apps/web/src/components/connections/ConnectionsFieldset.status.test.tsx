/**
 * Per-outcome discovery-status-line tests for ConnectionsFieldset.
 * Split into a separate file to keep ConnectionsFieldset.test.tsx under the 200-line limit.
 */
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
}));

const secretMutateAsync = vi.fn();
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: secretMutateAsync }),
}));

import { queryClient } from '../../lib/queryClient';
import { modelsQueryKey } from '../../hooks/conversation/useModels';

import { ConnectionsFieldset } from './ConnectionsFieldset';
import { registerCaptureHooks, render, settings } from './ConnectionsFieldset.testkit';

registerCaptureHooks();

beforeEach(() => {
  secretMutateAsync.mockReset();
  secretMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionsFieldset discovery status line - per-outcome', () => {
  it('unauthorized on a non-local connection shows the API-key-rejected line', () => {
    queryClient.setQueryData(modelsQueryKey, {
      models: [],
      connectionStatuses: [{ connectionId: 'openai', outcome: 'unauthorized' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    render(
      <ConnectionsFieldset
        settings={settings({
          selectedModelId: '',
          connections: [
            {
              id: 'openai',
              type: 'openai',
              label: 'OpenAI',
              enabled: true,
              apiKey: { isSet: true },
            },
          ],
        } as never)}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText('OpenAI: the API key was rejected.')).toBeInTheDocument();
  });

  it('error on a non-local connection shows the could-not-load line', () => {
    queryClient.setQueryData(modelsQueryKey, {
      models: [],
      connectionStatuses: [{ connectionId: 'openai', outcome: 'error' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    render(
      <ConnectionsFieldset
        settings={settings({
          selectedModelId: '',
          connections: [
            {
              id: 'openai',
              type: 'openai',
              label: 'OpenAI',
              enabled: true,
              apiKey: { isSet: true },
            },
          ],
        } as never)}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText('OpenAI: could not load models.')).toBeInTheDocument();
  });

  it('empty on an openai-compatible connection shows the no-models-loaded hint', () => {
    queryClient.setQueryData(modelsQueryKey, {
      models: [],
      connectionStatuses: [{ connectionId: 'local', outcome: 'empty' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    render(
      <ConnectionsFieldset
        settings={settings({
          selectedModelId: '',
          connections: [
            {
              id: 'local',
              type: 'openai-compatible',
              label: 'Local',
              baseUrl: 'http://localhost:1234',
              enabled: true,
              apiKey: { isSet: false },
            },
          ],
        } as never)}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByText('Local is reachable but has no models loaded.')).toBeInTheDocument();
  });

  it('ok outcome renders no status line', () => {
    queryClient.setQueryData(modelsQueryKey, {
      models: [{ id: 'local:m', label: 'A model', connectionId: 'local' }],
      connectionStatuses: [{ connectionId: 'local', outcome: 'ok' }],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    render(
      <ConnectionsFieldset
        settings={settings({
          selectedModelId: '',
          connections: [
            {
              id: 'local',
              type: 'openai-compatible',
              label: 'Local',
              baseUrl: 'http://localhost:1234',
              enabled: true,
              apiKey: { isSet: false },
            },
          ],
        } as never)}
        onPatch={vi.fn()}
      />,
    );
    // No status problem line should appear for any known problem wording.
    expect(
      screen.queryByText('Local is reachable but has no models loaded.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Local: the API key was rejected.')).not.toBeInTheDocument();
    expect(screen.queryByText('Local: could not load models.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not reach your local server at/)).not.toBeInTheDocument();
  });
});
