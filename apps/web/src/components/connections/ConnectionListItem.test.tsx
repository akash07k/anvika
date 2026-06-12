import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RedactedConnection } from '@anvika/shared/settings/redact';

import { queryClient } from '../../lib/queryClient';
import type { TestOutcome } from '../../hooks/connections/useTestConnection';

const mutate = vi.fn();
let mockState: { isPending: boolean; data: TestOutcome | undefined } = {
  isPending: false,
  data: undefined,
};
vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate, isPending: mockState.isPending, data: mockState.data }),
}));

import { ConnectionListItem } from './ConnectionListItem';
import { render } from './ConnectionsFieldset.testkit';

/** A redacted openai-compatible connection named Venice with a stored key. */
function venice(overrides: Partial<RedactedConnection> = {}): RedactedConnection {
  return {
    id: 'venice',
    type: 'openai-compatible',
    label: 'Venice',
    baseUrl: 'https://venice.example/v1',
    enabled: true,
    apiKey: { isSet: true },
    ...overrides,
  } as RedactedConnection;
}

beforeEach(() => {
  queryClient.clear();
  mutate.mockClear();
  mockState = { isPending: false, data: undefined };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ConnectionListItem', () => {
  it('composes each action name from the verb plus the connection heading', () => {
    render(
      <ConnectionListItem
        connection={venice()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Edit Venice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Venice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test Venice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Venice' })).toBeInTheDocument();
    // The Active checkbox composes its name from the "Active" label plus the connection heading, so a
    // list of rows announces "Active Venice" rather than an ambiguous bare "Active" per row.
    expect(screen.getByRole('checkbox', { name: 'Active Venice' })).toBeInTheDocument();
  });

  it('reflects a set API key in the key indicator', () => {
    render(
      <ConnectionListItem
        connection={venice()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    expect(screen.getByText('API key: Set')).toBeInTheDocument();
  });

  it('reflects an unset API key in the key indicator', () => {
    render(
      <ConnectionListItem
        connection={venice({ apiKey: { isSet: false } })}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    expect(screen.getByText('API key: not set')).toBeInTheDocument();
  });

  it('invokes Edit and Remove handlers', async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <ConnectionListItem
        connection={venice()}
        onEdit={onEdit}
        onRemove={onRemove}
        onToggleEnabled={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit Venice' }));
    await user.click(screen.getByRole('button', { name: 'Remove Venice' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('tests the saved connection by id on Test click', async () => {
    const user = userEvent.setup();
    render(
      <ConnectionListItem
        connection={venice()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Test Venice' }));
    expect(mutate).toHaveBeenCalledWith({ connectionId: 'venice' });
  });

  it('shows a focusable busy state via aria-disabled while a test is pending', () => {
    mockState = { isPending: true, data: undefined };
    render(
      <ConnectionListItem
        connection={venice()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onToggleEnabled={vi.fn()}
      />,
    );
    // The visible verb becomes "Testing...", so the composed accessible name is "Testing... Venice".
    const test = screen.getByRole('button', { name: 'Testing... Venice' });
    expect(test).toHaveTextContent('Testing...');
    expect(test).toHaveAttribute('aria-disabled', 'true');
    expect(test).not.toBeDisabled();
  });

  it('renders the Last test line for each outcome and nothing before the first test', () => {
    const cases: { data: TestOutcome | undefined; text: string | null }[] = [
      { data: undefined, text: null },
      { data: { kind: 'ok', modelCount: 3 }, text: 'Last test: OK, found 3 models' },
      { data: { kind: 'ok', modelCount: 1 }, text: 'Last test: OK, found 1 model' },
      { data: { kind: 'ok-no-listing' }, text: 'Last test: OK; provider lists no models' },
      {
        data: { kind: 'failed', category: 'unauthorized' },
        text: 'Last test: failed (unauthorized)',
      },
      {
        data: { kind: 'failed', category: 'unreachable' },
        text: 'Last test: failed (unreachable)',
      },
      { data: { kind: 'failed', category: 'error' }, text: 'Last test: failed (error)' },
    ];
    for (const { data, text } of cases) {
      mockState = { isPending: false, data };
      const view = render(
        <ConnectionListItem
          connection={venice()}
          onEdit={vi.fn()}
          onRemove={vi.fn()}
          onToggleEnabled={vi.fn()}
        />,
      );
      if (text === null) {
        expect(screen.queryByText(/Last test:/)).not.toBeInTheDocument();
      } else {
        expect(screen.getByText(text)).toBeInTheDocument();
      }
      view.unmount();
    }
  });
});
