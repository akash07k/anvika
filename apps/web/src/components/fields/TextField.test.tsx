import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from './TextField';

describe('TextField', () => {
  it('sets aria-required only when required', () => {
    const { rerender } = render(
      <TextField id="f" label="Label" required value="" onCommit={vi.fn()} />,
    );
    // The label text stays exactly "Label" (the required asterisk is an aria-hidden sibling), so the
    // control's accessible name is unchanged and getByLabelText still resolves.
    expect(screen.getByLabelText('Label')).toHaveAttribute('aria-required', 'true');
    rerender(<TextField id="f" label="Label" value="" onCommit={vi.fn()} />);
    expect(screen.getByLabelText('Label')).not.toHaveAttribute('aria-required');
  });

  it('associates a description with the control via aria-describedby', () => {
    render(
      <TextField id="f" label="Label" description="Helpful hint." value="" onCommit={vi.fn()} />,
    );
    const describedBy = screen.getByLabelText('Label').getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    if (!describedBy) throw new Error('expected an aria-describedby');
    expect(document.getElementById(describedBy)?.textContent).toBe('Helpful hint.');
  });
});
