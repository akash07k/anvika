import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelInfo } from '@anvika/shared/models/model-info';
import type { RedactedSettings } from '@anvika/shared/settings/redact';

import { ModelSection } from './ModelSection';

const MODELS: ModelInfo[] = [
  {
    id: 'openai:gpt-4o',
    providerId: 'openai',
    connectionId: 'openai',
    connectionLabel: 'OpenAI',
    displayName: 'GPT-4o',
    contextWindow: null,
    maxOutputTokens: null,
    inputPrice: null,
    outputPrice: null,
    capabilities: { text: true, reasoning: false },
  },
];

vi.mock('../../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: MODELS, isPending: false }),
  useConnectionStatuses: () => ({ data: [] }),
}));

vi.mock('../../hooks/connections/useAnnounceDiscoveryProblems', () => ({
  useAnnounceDiscoveryProblems: () => undefined,
}));

const settings = {
  selectedModelId: 'openai:gpt-4o',
  connections: [],
} as unknown as RedactedSettings;

describe('ModelSection', () => {
  it('renders the model combobox bound to the selected model', () => {
    render(<ModelSection settings={settings} fieldErrors={{}} onSelectedModelChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Model/ })).toHaveTextContent('GPT-4o (OpenAI)');
  });
});
