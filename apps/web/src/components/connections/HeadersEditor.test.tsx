import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { HeadersEditor, type HeaderRow } from './HeadersEditor';

/** A controlled host so the editor's onChange round-trips through real state in tests. */
function Host({ initial }: { initial: HeaderRow[] }) {
  const [rows, setRows] = useState<HeaderRow[]>(initial);
  return <HeadersEditor rows={rows} onChange={setRows} />;
}

describe('HeadersEditor', () => {
  it('adds a row and moves focus to its name input', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add header/i }));
    expect(screen.getByLabelText('Header name 1')).toHaveFocus();
  });

  it('composes the Remove name from the typed header name', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add header/i }));
    await user.type(screen.getByLabelText('Header name 1'), 'X-Token');
    expect(screen.getByRole('button', { name: /remove header X-Token/i })).toBeInTheDocument();
  });

  it('removes the targeted row', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add header/i }));
    await user.type(screen.getByLabelText('Header name 1'), 'Authorization');
    await user.click(screen.getByRole('button', { name: /remove header Authorization/i }));
    expect(screen.queryByLabelText('Header name 1')).not.toBeInTheDocument();
  });

  it('shows Set for an existing header value instead of the value', () => {
    render(<Host initial={[{ name: 'Authorization', isSet: true }]} />);
    const remove = screen.getByRole('button', { name: /remove header Authorization/i });
    const row = remove.closest('div');
    expect(row).not.toBeNull();
    if (row) {
      // The only element named "Header value 1" is the Set indicator (a span borrowing the value
      // label), never an input - the value itself is never shown.
      expect(within(row).getByLabelText('Header value 1')).toHaveTextContent('Set');
    }
  });

  it('associates the stored-value Set indicator with the value label (no orphaned label)', () => {
    render(<Host initial={[{ name: 'Authorization', isSet: true }]} />);
    // The "Set" indicator borrows the value label via aria-labelledby, so AT announces it as the
    // header value's state - its accessible name resolves to "Header value 1".
    expect(screen.getByText('Set')).toHaveAccessibleName('Header value 1');
    // The value label no longer dangles at an absent input: the element it names is the Set
    // indicator span itself, not a missing control.
    expect(screen.getByLabelText('Header value 1')).toHaveTextContent('Set');
  });

  it('lets an existing value be replaced, revealing a value input', async () => {
    const user = userEvent.setup();
    render(<Host initial={[{ name: 'Authorization', isSet: true }]} />);
    await user.click(screen.getByRole('button', { name: /replace header value 1/i }));
    expect(screen.getByLabelText('Header value 1')).toBeInTheDocument();
  });

  it('moves focus to the remaining row after removing one of two', async () => {
    const user = userEvent.setup();
    render(
      <Host
        initial={[
          { name: 'Authorization', isSet: false, value: 'a' },
          { name: 'X-Token', isSet: false, value: 'b' },
        ]}
      />,
    );
    await user.click(screen.getByRole('button', { name: /remove header X-Token/i }));
    // The removed index clamps to the new last row, so focus lands on the remaining row's name input.
    expect(screen.getByLabelText('Header name 1')).toHaveFocus();
  });

  it('moves focus to the Add button when the last row is removed', async () => {
    const user = userEvent.setup();
    render(<Host initial={[{ name: 'Authorization', isSet: false, value: 'a' }]} />);
    await user.click(screen.getByRole('button', { name: /remove header Authorization/i }));
    expect(screen.getByRole('button', { name: /add header/i })).toHaveFocus();
  });

  it('warns on a stored-value row that renaming it clears the value', () => {
    render(<Host initial={[{ name: 'Authorization', isSet: true }]} />);
    const nameInput = screen.getByLabelText('Header name 1');
    expect(nameInput).toHaveAccessibleDescription(/renaming clears the stored value/i);
  });

  it('does not warn on a fresh (not-yet-stored) header name', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add header/i }));
    const nameInput = screen.getByLabelText('Header name 1');
    expect(nameInput).not.toHaveAccessibleDescription(/renaming clears/i);
  });
});
