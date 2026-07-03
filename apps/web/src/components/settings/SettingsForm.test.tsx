import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useModelsMock, useConnectionStatusesMock, apiPostMock } = vi.hoisted(() => ({
  useModelsMock: vi.fn(),
  useConnectionStatusesMock: vi.fn(),
  apiPostMock: vi.fn(),
}));
vi.mock('../../hooks/conversation/useModels', () => ({
  useModels: useModelsMock,
  useConnectionStatuses: useConnectionStatusesMock,
}));
// Stub api-client so useRefreshModels (called by ModelRefreshControl) can POST without a real
// server. apiGet is not used in this test file; apiPost default resolves to null (204-like).
vi.mock('../../lib/api-client', () => ({
  apiGet: vi.fn(),
  apiPost: apiPostMock,
}));
// The connections fieldset (rendered transitively) calls useSetConnectionSecret() (a TanStack
// mutation). With no QueryClientProvider here, stub it to an inert mutation; the secret-write path
// is covered by ConnectionsFieldset.test.tsx.
vi.mock('../../hooks/connections/useSetConnectionSecret', () => ({
  useSetConnectionSecret: () => ({ mutateAsync: vi.fn() }),
}));

import { SettingsForm } from './SettingsForm';
import { model, settings } from './SettingsForm.testkit';

describe('SettingsForm structure and model selection', () => {
  // SettingsForm calls useModels() and useConnectionStatuses(). Default both to empty successful
  // results so the picker renders its empty state with no discovery-problem pointer. Cases that
  // exercise specific behaviour override these individually.
  beforeEach(() => {
    useModelsMock.mockReturnValue({ data: [], isSuccess: true });
    useConnectionStatusesMock.mockReturnValue({ data: [], isSuccess: true });
    // Default: resolves to null (no body) so useRefreshModels takes the 204 path without throwing.
    apiPostMock.mockResolvedValue(null);
  });

  it('renders the scalar fields and the connections group', () => {
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    expect(screen.getByRole('spinbutton', { name: /announcement period/i })).toHaveValue(2000);
    expect(screen.getByRole('combobox', { name: /send key/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /connections/i })).toBeInTheDocument();
  });

  it('groups the form into navigable sections with headings', () => {
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    // The connections heading carries a live count (0 here), so match it by pattern.
    expect(screen.getByRole('heading', { name: /^Connections? \(\d+\)$/ })).toBeInTheDocument();
    for (const name of ['Model', 'Preferences']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('renders the model combobox trigger showing the currently selected model', () => {
    useModelsMock.mockReturnValue({
      data: [model('anthropic:claude-x', 'anthropic', 'Claude X')],
      isSuccess: true,
    });
    // Settings with a stored selection: trigger should reflect it.
    render(
      <SettingsForm
        settings={settings({ selectedModelId: 'anthropic:claude-x' })}
        onPatch={vi.fn()}
      />,
    );
    // jsdom aria-labelledby self-reference does not include the element's own text in the computed
    // name, so the accessible name is just the field label "Model". The text content carries the
    // selection. Full "Model Claude X (anthropic)" name is verified in the browser test suite.
    expect(screen.getByRole('button', { name: /Model/ })).toHaveTextContent('Claude X (anthropic)');
  });

  it('commits a typed custom model id on blur (announce default)', async () => {
    const onPatch = vi.fn();
    render(<SettingsForm settings={settings()} onPatch={onPatch} />);
    const custom = screen.getByRole('textbox', { name: /custom model id/i });
    await userEvent.type(custom, 'openrouter:some/new-model');
    expect(onPatch).not.toHaveBeenCalled(); // no per-keystroke patch
    await userEvent.tab();
    const firstCall = onPatch.mock.calls[0];
    if (!firstCall) throw new Error('expected onPatch to be called');
    expect(firstCall[0]).toEqual({ selectedModelId: 'openrouter:some/new-model' });
    expect(firstCall[2]).toBeUndefined(); // text commit announces by default
  });

  it('shows the empty-state guidance and a disabled trigger when no models are available', () => {
    useModelsMock.mockReturnValue({ data: [], isSuccess: true });
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    expect(
      screen.getByText('Add a connection above, then choose a model here.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Model/ })).toBeDisabled();
    // The advanced escape hatch is still usable even when the list is empty.
    expect(screen.getByRole('textbox', { name: /custom model id/i })).toBeEnabled();
  });

  it('renders the currency select and the INR-per-USD rate field', () => {
    render(
      <SettingsForm settings={settings({ currency: 'USD', inrPerUsd: 95.11 })} onPatch={vi.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveValue('USD');
    expect(screen.getByRole('spinbutton', { name: 'INR per USD' })).toHaveValue(95.11);
  });

  it('commits a currency change through onPatch', async () => {
    const onPatch = vi.fn();
    render(
      <SettingsForm settings={settings({ currency: 'USD', inrPerUsd: 95.11 })} onPatch={onPatch} />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'INR');
    expect(onPatch).toHaveBeenCalledWith({ currency: 'INR' }, expect.any(Function));
  });

  it('renders the FX refresh button, auto-refresh toggle, and last-updated line', () => {
    render(
      <SettingsForm
        settings={settings({ autoRefreshFxRate: false, inrPerUsdUpdatedAt: null })}
        onPatch={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Update exchange rate now' })).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Automatically refresh the exchange rate' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Exchange rate last updated: never')).toBeInTheDocument();
  });

  it('commits the auto-refresh toggle through onPatch', async () => {
    const onPatch = vi.fn();
    render(
      <SettingsForm
        settings={settings({ autoRefreshFxRate: false, inrPerUsdUpdatedAt: null })}
        onPatch={onPatch}
      />,
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Automatically refresh the exchange rate' }),
    );
    expect(onPatch).toHaveBeenCalledWith({ autoRefreshFxRate: true }, expect.any(Function));
  });

  it('renders a Refresh models button that refetches on press', async () => {
    apiPostMock.mockResolvedValue({
      models: [],
      connectionStatuses: [],
      priceCurrency: 'USD',
      priceUnit: 'perMillionTokens',
    });
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Refresh models' });
    await userEvent.click(button);
    expect(apiPostMock).toHaveBeenCalledWith('/api/v1/models/refresh', {}, expect.anything());
  });

  it('Refresh models button is aria-disabled and aria-busy while the POST is in flight', async () => {
    // Override: never-resolving promise keeps the refresh in flight.
    apiPostMock.mockReturnValue(new Promise(() => {}));
    render(<SettingsForm settings={settings()} onPatch={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Refresh models' });
    // fireEvent is synchronous - dispatches click immediately so refresh() starts and
    // setBusy(true) queues before we flush state with act().
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renders the global thinking-effort select and patches it', async () => {
    const onPatch = vi.fn().mockResolvedValue(true);
    render(<SettingsForm settings={settings({ reasoningEffort: 'medium' })} onPatch={onPatch} />);
    const select = screen.getByRole('combobox', { name: 'Thinking effort' });
    await userEvent.selectOptions(select, 'high');
    expect(onPatch).toHaveBeenCalledWith({ reasoningEffort: 'high' }, expect.any(Function));
  });
});
