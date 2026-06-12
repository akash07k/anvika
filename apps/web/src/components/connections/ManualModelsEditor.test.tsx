import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ManualModelsEditor } from './ManualModelsEditor';

/** A controlled host so the editor's onChange round-trips through real state in tests. */
function Host({ initial }: { initial: string[] }) {
  const [ids, setIds] = useState<string[]>(initial);
  return <ManualModelsEditor ids={ids} onChange={setIds} />;
}

describe('ManualModelsEditor', () => {
  it('adds a row and moves focus to its input', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add manual model/i }));
    expect(screen.getByLabelText('Model ID 1')).toHaveFocus();
  });

  it('composes the Remove name from the typed model id', async () => {
    const user = userEvent.setup();
    render(<Host initial={[]} />);
    await user.click(screen.getByRole('button', { name: /add manual model/i }));
    await user.type(screen.getByLabelText('Model ID 1'), 'gpt-4o');
    expect(screen.getByRole('button', { name: /remove model gpt-4o/i })).toBeInTheDocument();
  });

  it('moves focus to the previous row after removing the last row', async () => {
    const user = userEvent.setup();
    render(<Host initial={['gpt-4o', 'o1-mini']} />);
    await user.click(screen.getByRole('button', { name: /remove model o1-mini/i }));
    // The removed index clamps to the new last row, so focus lands on the remaining row's input.
    expect(screen.getByLabelText('Model ID 1')).toHaveFocus();
  });

  it('moves focus to the Add button when the list becomes empty', async () => {
    const user = userEvent.setup();
    render(<Host initial={['gpt-4o']} />);
    await user.click(screen.getByRole('button', { name: /remove model gpt-4o/i }));
    expect(screen.getByRole('button', { name: /add manual model/i })).toHaveFocus();
  });
});
