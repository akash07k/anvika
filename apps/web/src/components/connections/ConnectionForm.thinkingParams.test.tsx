import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

const mutate = vi.fn();
vi.mock('../../hooks/connections/useTestConnection', () => ({
  useTestConnection: () => ({ mutate, isPending: false }),
}));

vi.mock('../../notifications/notifier', () => ({
  notify: vi.fn(),
}));

import { ConnectionForm } from './ConnectionForm';

beforeEach(() => {
  mutate.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Choose a connection type via the visible "Type" select. */
async function selectType(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.selectOptions(screen.getByLabelText('Type'), label);
}

describe('ConnectionForm -- extended thinking params', () => {
  it('shows the Send extended thinking parameters checkbox, checked by default, for an openai-compatible connection', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    expect(
      screen.getByRole('checkbox', { name: /send extended thinking parameters/i }),
    ).toBeChecked();
  });

  it('hides the thinking-params checkbox for a cloud connection', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI');
    expect(
      screen.queryByRole('checkbox', { name: /send extended thinking parameters/i }),
    ).toBeNull();
  });

  it('renders the operator-flags help note for an openai-compatible connection', async () => {
    const user = userEvent.setup();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await selectType(user, 'OpenAI-compatible');
    expect(screen.getByText(/jinja/i)).toBeInTheDocument();
  });
});
