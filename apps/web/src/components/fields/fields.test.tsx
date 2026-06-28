import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { formatTwoToThreeDecimals } from '../../lib/format/formatDecimals';
import { committableNumber, NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import { ToggleField } from './ToggleField';

describe('committableNumber (NumberField blur guard)', () => {
  it('skips blank, unchanged, and non-finite drafts; commits a finite change', () => {
    expect(committableNumber('', 2000)).toBeNull(); // blank: in-progress edit, not 0
    expect(committableNumber('2000', 2000)).toBeNull(); // unchanged
    expect(committableNumber('abc', 2000)).toBeNull(); // NaN
    expect(committableNumber('1e999', 2000)).toBeNull(); // Infinity (overflow)
    expect(committableNumber('9'.repeat(400), 2000)).toBeNull(); // Infinity (all-digit overflow)
    expect(committableNumber('2500', 2000)).toBe(2500); // finite change commits
  });

  it('uses the provided formatter for the unchanged check', () => {
    // formatted-unchanged ('95.12' === format(95.12)): no commit, so no spurious rate re-stamp.
    expect(committableNumber('95.12', 95.12, formatTwoToThreeDecimals)).toBeNull();
    expect(committableNumber('95.5', 95.12, formatTwoToThreeDecimals)).toBe(95.5); // a real edit commits
  });
});

describe('field primitives', () => {
  it('TextField associates label, description, and error as non-live describedby text (ADR 0015)', () => {
    render(
      <TextField
        id="base"
        label="Base URL"
        description="The local server."
        error="Required"
        value="x"
        onCommit={() => {}}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Base URL' });
    expect(input).toHaveAccessibleDescription(/local server/i);
    // The error is non-live (no role=alert) but associated to the control via aria-describedby, so a
    // screen reader reads it on reaching the field while the notifier owns the one-time announcement.
    expect(screen.queryByRole('alert')).toBeNull();
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const errEl = describedBy
      .split(' ')
      .map((errorId) => document.getElementById(errorId))
      .find((el) => el?.textContent === 'Required');
    expect(errEl).toBeTruthy();
  });

  it('TextField commits on blur (not per keystroke), and not when unchanged', async () => {
    const onCommit = vi.fn();
    render(<TextField id="m" label="Model" value="" onCommit={onCommit} />);
    const input = screen.getByRole('textbox', { name: 'Model' });
    await userEvent.type(input, 'gpt');
    expect(onCommit).not.toHaveBeenCalled(); // no per-keystroke commit
    await userEvent.tab(); // blur commits once
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith('gpt');
  });

  it('NumberField commits a numeric value on blur', async () => {
    const onCommit = vi.fn();
    render(<NumberField id="p" label="Period" value={2000} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton', { name: 'Period' });
    await userEvent.clear(input);
    await userEvent.type(input, '2500');
    expect(onCommit).not.toHaveBeenCalled(); // never commits the partial 2 / 25 / 250
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith(2500);
  });

  it('NumberField renders the value through format and does not re-commit an unedited draft', async () => {
    const onCommit = vi.fn();
    render(
      <NumberField
        id="r"
        label="INR per USD"
        value={95.12}
        onCommit={onCommit}
        format={formatTwoToThreeDecimals}
      />,
    );
    const input = screen.getByRole('spinbutton', { name: 'INR per USD' });
    expect(input).toHaveDisplayValue('95.12'); // 2-3 decimals, no padded third zero
    await userEvent.click(input);
    await userEvent.tab(); // blur with no edit must not commit (would otherwise re-stamp the rate)
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('NumberField does not commit when cleared to blank on blur', async () => {
    const onCommit = vi.fn();
    render(<NumberField id="p" label="Period" value={2000} onCommit={onCommit} />);
    const input = screen.getByRole('spinbutton', { name: 'Period' });
    await userEvent.clear(input);
    await userEvent.tab(); // blank draft must not commit Number('') === 0
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ToggleField is a labelled checkbox', async () => {
    const onChange = vi.fn();
    render(<ToggleField id="r" label="Read whole" checked={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Read whole' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('SelectField offers labelled options and reports selection', async () => {
    const onChange = vi.fn();
    render(
      <SelectField
        id="f"
        label="Focus"
        value="keep"
        options={[
          { value: 'keep', label: 'Keep' },
          { value: 'move', label: 'Move' },
        ]}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Focus' }), 'move');
    expect(onChange).toHaveBeenCalledWith('move');
  });
});
