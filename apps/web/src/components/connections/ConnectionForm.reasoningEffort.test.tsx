import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('ConnectionForm -- per-connection thinking effort', () => {
  it('renders a per-connection thinking-effort select and saves the chosen value', async () => {
    const onSubmit = vi.fn();
    render(
      <ConnectionForm mode="add" existingIds={[]} onSubmit={onSubmit} onCancel={() => undefined} />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Claude');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Thinking effort' }), 'low');
    await userEvent.click(screen.getByRole('button', { name: 'Save connection' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: expect.objectContaining({ reasoningEffort: 'low' }),
      }),
    );
  });
});
