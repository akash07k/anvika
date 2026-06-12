import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicConnection } from '@anvika/shared/settings/connection';
import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';
import type { RedactedConnection } from '@anvika/shared/settings/redact';

/** The result shape the form hands to onSubmit: a public connection plus an optional secret-patch. */
type SubmitResult = { connection: PublicConnection; secret: SetConnectionSecret | null };

const mutate = vi.fn();
vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate, isPending: false }),
}));

const notifyMock = vi.fn();
vi.mock('../../notifications/notifier', () => ({
  notify: (event: unknown) => notifyMock(event),
}));

import { ConnectionForm } from './ConnectionForm';

beforeEach(() => {
  mutate.mockClear();
  notifyMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The first argument of a spy's first call, guarded so `noUncheckedIndexedAccess` is satisfied. */
function firstArg(spy: ReturnType<typeof vi.fn>): unknown {
  const call = spy.mock.calls[0];
  if (!call) throw new Error('expected the spy to have been called at least once');
  return call[0];
}

const existing: RedactedConnection = {
  id: 'venice',
  type: 'openai-compatible',
  label: 'Venice',
  reasoningEffort: 'inherit',
  enabled: true,
  baseUrl: 'https://venice.example/v1',
  sendThinkingParams: true,
  apiKey: { isSet: true },
  headers: { Authorization: { isSet: true } },
};

/** Render the form in edit mode over the shared {@link existing} fixture. */
function renderEdit(onSubmit = vi.fn()) {
  render(
    <ConnectionForm
      mode="edit"
      existing={existing}
      existingIds={['venice']}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
}

describe('ConnectionForm (edit mode)', () => {
  it('renders the type and id as static text, not editable controls', () => {
    renderEdit();
    expect(screen.getByText(/OpenAI-compatible/)).toBeInTheDocument();
    expect(screen.getByText(/venice/)).toBeInTheDocument();
    // Type and id must NOT be editable controls in edit mode.
    expect(screen.queryByRole('combobox', { name: 'Type' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Connection id')).not.toBeInTheDocument();
  });

  it('focuses the edit heading naming the connection on mount', () => {
    renderEdit();
    const heading = screen.getByRole('heading', { name: 'Edit Venice', level: 3 });
    expect(heading).toHaveFocus();
  });

  it('wraps the edit form in a labelled region landmark naming the connection', () => {
    renderEdit();
    // The region name carries the connection ("Edit Venice"), so navigating by landmark announces
    // exactly which connection's inline edit region the user has entered or left.
    expect(screen.getByRole('region', { name: 'Edit Venice' })).toBeInTheDocument();
  });

  it('shows the secret as Set rather than a value', () => {
    renderEdit();
    // The API key Set indicator is associated with the API key label (the header rows also show
    // "Set", so scope to the apiKey region rather than a bare getByText).
    const replace = screen.getByRole('button', { name: /replace api key/i });
    const apiKeyRegion = replace.closest('span');
    expect(apiKeyRegion).not.toBeNull();
    if (apiKeyRegion) expect(within(apiKeyRegion).getByText('Set')).toBeInTheDocument();
  });

  it('tests the saved connection by id when the key was not re-typed', async () => {
    const user = userEvent.setup();
    renderEdit();
    await user.click(screen.getByRole('button', { name: /^test/i }));
    expect(mutate).toHaveBeenCalledWith({ connectionId: 'venice' });
  });

  it('omits apiKey on Save when the key was not re-typed', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderEdit(onSubmit);
    await user.click(screen.getByRole('button', { name: /^save connection/i }));
    const { connection, secret } = firstArg(onSubmit) as SubmitResult;
    expect(connection).not.toHaveProperty('apiKey');
    expect(connection.id).toBe('venice');
    // The key was untouched, so there is no secret to write.
    expect(secret).toBeNull();
  });

  it('tests the saved connection with a secret override when the key is re-typed', async () => {
    const user = userEvent.setup();
    renderEdit();
    await user.click(screen.getByRole('button', { name: /replace api key/i }));
    await user.type(screen.getByLabelText('API key'), 'sk-new');
    await user.tab(); // commit the key on blur (no inner Save button)
    await user.click(screen.getByRole('button', { name: /^test/i }));
    const arg = firstArg(mutate) as { connectionId: string; override?: SetConnectionSecret };
    expect(arg.connectionId).toBe('venice');
    expect(arg.override?.apiKey).toBe('sk-new');
    expect(arg).not.toHaveProperty('connection'); // an edit probes by id, never the full connection
  });

  it('submits a non-null secret-patch on edit when the key is re-typed', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderEdit(onSubmit);
    await user.click(screen.getByRole('button', { name: /replace api key/i }));
    await user.type(screen.getByLabelText('API key'), 'sk-new');
    await user.tab(); // commit the key on blur (no inner Save button)
    await user.click(screen.getByRole('button', { name: /^save connection/i }));
    const { connection, secret } = firstArg(onSubmit) as SubmitResult;
    expect(connection).not.toHaveProperty('apiKey'); // never on the public connection
    expect(secret?.apiKey).toBe('sk-new');
  });

  it('pre-fills existing header rows with a per-value Set indicator', () => {
    renderEdit();
    expect(screen.getByDisplayValue('Authorization')).toBeInTheDocument();
    const removeBtn = screen.getByRole('button', { name: /remove header Authorization/i });
    expect(removeBtn).toBeInTheDocument();
    const row = removeBtn.closest('div');
    expect(row).not.toBeNull();
    if (row) expect(within(row).getByText('Set')).toBeInTheDocument();
  });
});
