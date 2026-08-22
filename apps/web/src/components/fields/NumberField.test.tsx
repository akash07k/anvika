import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { NumberField } from './NumberField';

describe('NumberField', () => {
  it('preserves active typing through an unrelated rerender and replaces it for a new value', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NumberField id="f" label="Label" value={1} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('Label');

    await user.clear(input);
    await user.type(input, '25');
    rerender(<NumberField id="f" label="Label" value={1} onCommit={vi.fn()} />);
    expect(input).toHaveValue(25);

    rerender(<NumberField id="f" label="Label" value={42} onCommit={vi.fn()} />);
    expect(input).toHaveValue(42);
  });
});
