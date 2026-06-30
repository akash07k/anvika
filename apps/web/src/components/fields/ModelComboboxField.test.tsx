import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelInfo } from '@anvika/shared/models/model-info';

import { USE_DEFAULT } from '../../lib/models/modelPicker';
import { ModelComboboxField } from './ModelComboboxField';

function model(partial: Partial<ModelInfo>): ModelInfo {
  return {
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
    ...partial,
  };
}

const MODELS = [
  model({ id: 'openai:gpt-4o', displayName: 'GPT-4o' }),
  model({
    id: 'anthropic:sonnet',
    connectionId: 'anthropic',
    connectionLabel: 'Anthropic',
    providerId: 'anthropic',
    displayName: 'Claude Sonnet',
  }),
];

describe('ModelComboboxField (render)', () => {
  it('labels the trigger and shows the selected model', () => {
    render(
      <ModelComboboxField
        id="m"
        label="Model"
        value="anthropic:sonnet"
        models={MODELS}
        onChange={vi.fn()}
      />,
    );
    // jsdom aria-labelledby self-reference does not recurse into the element's own text, so the
    // computed name in jsdom is just the field label. The button's visible text content IS the
    // selected model - assert it here as a regression guard; the browser tests verify the full
    // "Model <selection>" accessible name in a real browser engine.
    const trigger = screen.getByRole('button', { name: 'Model' });
    expect(trigger).toHaveTextContent('Claude Sonnet (Anthropic)');
  });

  it('prompts when nothing is selected', () => {
    render(<ModelComboboxField id="m" label="Model" value="" models={MODELS} onChange={vi.fn()} />);
    // jsdom self-reference limitation: name is just "Model"; text content carries the prompt text.
    expect(screen.getByRole('button', { name: 'Model' })).toHaveTextContent('Select a model');
  });

  it('lists the connections in the scope select', () => {
    render(<ModelComboboxField id="m" label="Model" value="" models={MODELS} onChange={vi.fn()} />);
    const scope = screen.getByRole('combobox', { name: 'Connection' });
    expect(within(scope).getByRole('option', { name: 'All connections' })).toBeInTheDocument();
    expect(within(scope).getByRole('option', { name: 'Anthropic' })).toBeInTheDocument();
  });

  it('disables the trigger and shows guidance when there are no models', () => {
    render(<ModelComboboxField id="m" label="Model" value="" models={[]} onChange={vi.fn()} />);
    expect(
      screen.getByText('Add a connection above, then choose a model here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Model/ })).toBeDisabled();
  });

  it('shows a loading state while models are pending (not the add-a-connection guidance)', () => {
    render(
      <ModelComboboxField id="m" label="Model" value="" models={[]} loading onChange={vi.fn()} />,
    );
    expect(screen.getByText('Loading models')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Model/ })).toBeDisabled();
    expect(screen.queryByText(/Add a connection above/)).not.toBeInTheDocument();
  });

  it('renders the match-count cue and associates it with the trigger', () => {
    render(<ModelComboboxField id="m" label="Model" value="" models={MODELS} onChange={vi.fn()} />);
    expect(screen.getByText('2 models')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Model/ })).toHaveAccessibleDescription(/2 models/);
  });

  it('appends a discovery pointer to the description', () => {
    render(
      <ModelComboboxField
        id="m"
        label="Model"
        value=""
        models={MODELS}
        discoveryProblem
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/could not be reached/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Model/ })).toHaveAccessibleDescription(
      /could not be reached/i,
    );
  });
});

describe('ModelComboboxField - useDefaultOption prop (render)', () => {
  it('shows "Use default model" in the trigger when value is USE_DEFAULT', () => {
    render(
      <ModelComboboxField
        id="m"
        label="Model"
        value={USE_DEFAULT}
        models={MODELS}
        useDefaultOption
        onChange={vi.fn()}
      />,
    );
    // jsdom self-reference limitation: accessible name is just "Model"; the visible text is the guard.
    const trigger = screen.getByRole('button', { name: 'Model' });
    expect(trigger).toHaveTextContent('Use default model');
  });

  it('does not render "Use default model" text when useDefaultOption is not passed', () => {
    render(<ModelComboboxField id="m" label="Model" value="" models={MODELS} onChange={vi.fn()} />);
    expect(screen.queryByText('Use default model')).not.toBeInTheDocument();
  });
});
