import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReasoningEffortControl } from './ReasoningEffortControl';

describe('ReasoningEffortControl', () => {
  it('renders the inherit/off/low/medium/high options and calls onChange', async () => {
    const onChange = vi.fn();
    render(<ReasoningEffortControl value="inherit" capable={true} onChange={onChange} />);
    const select = screen.getByRole('combobox', { name: 'Thinking effort' });
    await userEvent.selectOptions(select, 'high');
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('disables with an explanation when the model is not reasoning-capable', () => {
    render(<ReasoningEffortControl value="inherit" capable={false} onChange={() => undefined} />);
    const select = screen.getByRole('combobox', { name: 'Thinking effort' });
    expect(select).toBeDisabled();
    expect(screen.getByText('This model does not support thinking')).toBeInTheDocument();
  });
});
