import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Connection, PublicConnection } from '@anvika/shared/settings/connection';
import type { SetConnectionSecret } from '@anvika/shared/connections/contracts';

/** The result shape the form now hands to onSubmit: a public connection plus an optional secret-patch. */
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

/** Choose a connection type via the visible "Type" select. */
async function selectType(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.selectOptions(screen.getByLabelText('Type'), label);
}

/** The first argument of a spy's first call, guarded so `noUncheckedIndexedAccess` is satisfied. */
function firstArg(spy: ReturnType<typeof vi.fn>): unknown {
  const call = spy.mock.calls[0];
  if (!call) throw new Error('expected the spy to have been called at least once');
  return call[0];
}

describe('ConnectionForm (add mode)', () => {
  it('moves focus to the form heading on mount', () => {
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const heading = screen.getByRole('heading', { name: 'Add connection', level: 3 });
    expect(heading).toHaveFocus();
  });

  it('wraps the form in a labelled region landmark named by its heading', () => {
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // A labelled region is a landmark a screen-reader user can navigate into and out of, so the
    // boundary of the inline add form is announced rather than blending into the connections list.
    expect(screen.getByRole('region', { name: 'Add connection' })).toBeInTheDocument();
  });

  it('marks required fields with aria-required (Label always; OpenAI-compatible Base URL)', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Label')).toHaveAttribute('aria-required', 'true');
    await selectType(user, 'OpenAI-compatible');
    expect(screen.getByLabelText('Base URL')).toHaveAttribute('aria-required', 'true');
  });

  it('does not mark the optional cloud Base URL override as required', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'Anthropic');
    expect(screen.getByLabelText('Base URL override')).not.toHaveAttribute('aria-required');
  });

  it('reveals OpenAI-compatible fields when that type is selected', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add header/i })).toBeInTheDocument();
  });

  it('reveals Azure-specific fields when Azure is selected', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'Azure');
    expect(screen.getByLabelText('Azure resource name')).toBeInTheDocument();
    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('API version')).toBeInTheDocument();
  });

  it('defaults the connection id from the typed label until the id is edited', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const labelInput = screen.getByLabelText('Label');
    await user.type(labelInput, 'My Venice');
    await user.tab(); // commit-on-blur
    expect(screen.getByLabelText('Connection id')).toHaveValue('my-venice');
  });

  it('stops auto-deriving the id once the user edits it manually', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const idInput = screen.getByLabelText('Connection id');
    await user.type(idInput, 'pinned');
    await user.tab();
    const labelInput = screen.getByLabelText('Label');
    await user.type(labelInput, 'Something Else');
    await user.tab();
    expect(screen.getByLabelText('Connection id')).toHaveValue('pinned');
  });

  it('adds a header row, focuses its key input, and gives Remove a composed name', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    await user.click(screen.getByRole('button', { name: /add header/i }));
    const keyInput = screen.getByLabelText('Header name 1');
    expect(keyInput).toHaveFocus();
    await user.type(keyInput, 'Authorization');
    expect(
      screen.getByRole('button', { name: /remove header Authorization/i }),
    ).toBeInTheDocument();
  });

  it('adds a manual-model row and focuses its first input', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    await user.click(screen.getByRole('button', { name: /add manual model/i }));
    const modelInput = screen.getByLabelText('Model ID 1');
    expect(modelInput).toHaveFocus();
  });

  it('tests the assembled draft connection via mutate({ connection })', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    await user.type(screen.getByLabelText('Label'), 'Venice');
    await user.tab();
    await user.type(screen.getByLabelText('Base URL'), 'https://venice.example/v1');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /^test/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const arg = firstArg(mutate) as { connection: Connection };
    expect(arg).toHaveProperty('connection');
    expect(arg.connection.type).toBe('openai-compatible');
    expect(arg.connection).not.toHaveProperty('connectionId');
  });

  it('submits a correctly-shaped connection on Save', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    await user.type(screen.getByLabelText('Label'), 'Venice');
    await user.tab();
    await user.type(screen.getByLabelText('Base URL'), 'https://venice.example/v1');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /^save connection/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const { connection, secret } = firstArg(onSubmit) as SubmitResult;
    expect(connection.type).toBe('openai-compatible');
    expect(connection.label).toBe('Venice');
    expect(connection.id).toBe('venice');
    // The PUBLIC connection never carries a secret; with no key typed the secret-patch is null.
    expect(connection).not.toHaveProperty('apiKey');
    expect(secret).toBeNull();
  });

  it('hands a non-null secret-patch with the typed apiKey, never on the public connection', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    await user.type(screen.getByLabelText('Label'), 'Venice');
    await user.tab();
    await user.type(screen.getByLabelText('Base URL'), 'https://venice.example/v1');
    await user.tab();
    await user.type(screen.getByLabelText('API key'), 'sk-secret');
    await user.tab(); // commit the key on blur (no inner Save button)
    await user.click(screen.getByRole('button', { name: /^save connection/i }));
    const { connection, secret } = firstArg(onSubmit) as SubmitResult;
    expect(connection).not.toHaveProperty('apiKey'); // the secret never rides the public connection
    expect(secret?.apiKey).toBe('sk-secret');
  });

  it('gives content-safe feedback and does not submit when the draft is invalid', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    // Save with an empty Label (and no Base URL) - the draft fails validation.
    await user.click(screen.getByRole('button', { name: /^save connection/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    // A content-safe failure is announced once via the notification layer.
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const event = firstArg(notifyMock) as { type: string; message: string };
    expect(event.type).toBe('settingsSaveFailed');
    expect(event.message).toMatch(/cannot save connection/i);
    // The same message is rendered inline as non-live text (no secret leaked).
    expect(screen.getByText(/cannot save connection/i)).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
