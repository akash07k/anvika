import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('ConnectionForm Save double-submit guard', () => {
  it('fires onSubmit exactly once for a rapid double-click and disables the button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    // Build a valid openai-compatible draft (label + base URL) so Save reaches onSubmit. TextField
    // commits on blur, so tab away from Base URL to commit it before clicking.
    await user.selectOptions(screen.getByLabelText('Type'), 'OpenAI-compatible');
    await user.type(screen.getByLabelText('Label'), 'Venice');
    await user.type(screen.getByLabelText('Base URL'), 'https://venice.example/v1');
    await user.tab();

    const save = screen.getByRole('button', { name: /^save connection/i });
    // Two synchronous clicks simulate a genuine rapid double-click within one tick. The ref guard
    // must let exactly one through.
    fireEvent.click(save);
    fireEvent.click(save);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).toHaveTextContent(/saving/i);
  });

  it('does not arm the guard when the draft is invalid (remains re-triable)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    // openai-compatible with no Base URL is invalid: Save must not fire onSubmit nor disable.
    await user.selectOptions(screen.getByLabelText('Type'), 'OpenAI-compatible');
    await user.type(screen.getByLabelText('Label'), 'Venice');
    await user.tab();

    const save = screen.getByRole('button', { name: /^save connection/i });
    fireEvent.click(save);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(save).toHaveAttribute('aria-disabled', 'false');
  });
});
