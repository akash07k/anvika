import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import { expect, test, vi } from 'vitest';

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

async function renderField(onChange = vi.fn()) {
  await render(
    <ModelComboboxField id="m" label="Model" value="" models={MODELS} onChange={onChange} />,
  );
  return { onChange };
}

test('opens, filters by query, and reports the chosen id', async () => {
  const { onChange } = await renderField();
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await userEvent.fill(page.getByPlaceholder('Search models'), 'sonnet');
  await userEvent.click(page.getByRole('option', { name: 'Claude Sonnet' }));
  expect(onChange).toHaveBeenCalledWith('anthropic:sonnet');
});

test('auto-highlights the first result while typing', async () => {
  await renderField();
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await userEvent.fill(page.getByPlaceholder('Search models'), 'claude');
  await expect
    .element(page.getByRole('option', { name: 'Claude Sonnet' }))
    .toHaveAttribute('aria-selected', 'true');
});

test('re-highlights the first result after a scope change', async () => {
  await renderField();
  await userEvent.selectOptions(page.getByRole('combobox', { name: 'Connection' }), 'anthropic');
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await expect
    .element(page.getByRole('option', { name: 'Claude Sonnet' }))
    .toHaveAttribute('aria-selected', 'true');
});

test('narrows the options by the connection scope', async () => {
  await renderField();
  await userEvent.selectOptions(page.getByRole('combobox', { name: 'Connection' }), 'anthropic');
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await expect.element(page.getByRole('option', { name: 'Claude Sonnet' })).toBeInTheDocument();
  await expect.element(page.getByRole('option', { name: 'GPT-4o' })).not.toBeInTheDocument();
});

test('shows an empty message when nothing matches', async () => {
  await renderField();
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await userEvent.fill(page.getByPlaceholder('Search models'), 'nothing-here');
  await expect.element(page.getByText('No models match')).toBeInTheDocument();
});

test('highlights the first result on open before any input', async () => {
  await renderField();
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await expect
    .element(page.getByRole('option', { name: 'GPT-4o' }))
    .toHaveAttribute('aria-selected', 'true');
});

test('clears the search query when the connection scope changes', async () => {
  await renderField();
  // Open the popover and type a query.
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await userEvent.fill(page.getByPlaceholder('Search models'), 'gpt');
  // The Connection select is outside PopoverContent so it is reachable while the popover is open.
  // Changing scope clears the query (Fix 4); the popover may close on the focus shift - press
  // Escape to ensure it is closed, then reopen so we can read the search input state.
  await userEvent.selectOptions(page.getByRole('combobox', { name: 'Connection' }), 'anthropic');
  await userEvent.keyboard('{Escape}');
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await expect.element(page.getByPlaceholder('Search models')).toHaveValue('');
  await expect.element(page.getByRole('option', { name: 'Claude Sonnet' })).toBeInTheDocument();
});

test('the collapsed trigger announces the selected model in its accessible name', async () => {
  await render(
    <ModelComboboxField
      id="m"
      label="Model"
      value="anthropic:sonnet"
      models={MODELS}
      onChange={vi.fn()}
    />,
  );
  // Real-browser ARIA name computation includes the self-referenced button text, so the name is the
  // field label plus the selected model - the direct guard for the aria-labelledby self-reference fix.
  await expect
    .element(page.getByRole('button', { name: 'Model Claude Sonnet (Anthropic)' }))
    .toBeInTheDocument();
});

test('useDefaultOption: "Use default model" appears first in the open popover', async () => {
  await render(
    <ModelComboboxField
      id="m"
      label="Model"
      value=""
      models={MODELS}
      useDefaultOption
      onChange={vi.fn()}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  const useDefaultOption = page.getByRole('option', { name: 'Use default model' });
  await expect.element(useDefaultOption).toBeInTheDocument();
  // It must appear before any model option (GPT-4o). Compare DOM positions.
  const defaultEl = useDefaultOption.element();
  const gptEl = page.getByRole('option', { name: 'GPT-4o' }).element();
  // Node.DOCUMENT_POSITION_FOLLOWING (4) means defaultEl precedes gptEl.
  expect(defaultEl.compareDocumentPosition(gptEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test('useDefaultOption: selecting "Use default model" calls onChange with USE_DEFAULT', async () => {
  const onChange = vi.fn();
  await render(
    <ModelComboboxField
      id="m"
      label="Model"
      value=""
      models={MODELS}
      useDefaultOption
      onChange={onChange}
    />,
  );
  await userEvent.click(page.getByRole('button', { name: /Model/ }));
  await userEvent.click(page.getByRole('option', { name: 'Use default model' }));
  expect(onChange).toHaveBeenCalledWith(USE_DEFAULT);
  // Popover should close after selection.
  await expect
    .element(page.getByRole('option', { name: 'Use default model' }))
    .not.toBeInTheDocument();
});

test('useDefaultOption: trigger announces "Use default model" when value is USE_DEFAULT', async () => {
  await render(
    <ModelComboboxField
      id="m"
      label="Model"
      value={USE_DEFAULT}
      models={MODELS}
      useDefaultOption
      onChange={vi.fn()}
    />,
  );
  // Real-browser ARIA name includes self-referenced button text.
  await expect
    .element(page.getByRole('button', { name: 'Model Use default model' }))
    .toBeInTheDocument();
});
