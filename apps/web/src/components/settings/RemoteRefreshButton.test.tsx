import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RemoteRefreshButton } from './RemoteRefreshButton';

describe('RemoteRefreshButton', () => {
  it('renders the label and calls onPress when clicked', async () => {
    const onPress = vi.fn();
    render(<RemoteRefreshButton label="Update exchange rate now" busy={false} onPress={onPress} />);
    await userEvent.click(screen.getByRole('button', { name: 'Update exchange rate now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is aria-disabled and busy-marked while busy (stays focusable for screen-reader users)', () => {
    render(<RemoteRefreshButton label="Update exchange rate now" busy onPress={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Update exchange rate now' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).not.toBeDisabled();
  });

  it('wires aria-describedby when describedBy is given, and omits it otherwise', () => {
    const { rerender } = render(
      <RemoteRefreshButton
        label="Refresh"
        busy={false}
        onPress={vi.fn()}
        describedBy="status-line"
      />,
    );
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute(
      'aria-describedby',
      'status-line',
    );
    rerender(<RemoteRefreshButton label="Refresh" busy={false} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toHaveAttribute('aria-describedby');
  });
});
