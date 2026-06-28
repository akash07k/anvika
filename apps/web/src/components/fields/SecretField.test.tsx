import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SecretField } from './SecretField';

describe('SecretField', () => {
  it('when not set, commits the typed value on blur and has no inner Save button', async () => {
    const onCommit = vi.fn();
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={onCommit} />);
    const input = screen.getByLabelText('Anthropic API key');
    await userEvent.type(input, 'sk-123');
    expect(onCommit).not.toHaveBeenCalled(); // not on keystroke
    await userEvent.tab(); // blur commits
    expect(onCommit).toHaveBeenCalledWith('sk-123');
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('keeps showing the masked draft after committing, so it can be re-revealed', async () => {
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    await userEvent.type(input, 'sk-123');
    await userEvent.tab();
    expect(input.value).toBe('sk-123'); // draft retained
    expect(input.type).toBe('password'); // still masked
  });

  it('does not commit an empty blur (stray focus leaves the draft untouched)', async () => {
    const onCommit = vi.fn();
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={onCommit} />);
    await userEvent.click(screen.getByLabelText('Anthropic API key'));
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('when set, shows a set indicator and a replace affordance, never the value', () => {
    render(<SecretField id="k" label="Anthropic API key" isSet onCommit={vi.fn()} />);
    expect(screen.getByText(/set/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('disambiguates the replace button by including the field label in its accessible name', () => {
    render(<SecretField id="k" label="Anthropic API key" isSet onCommit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /replace anthropic api key/i })).toBeInTheDocument();
  });

  it('clicking replace reveals an empty input to enter a new value', async () => {
    render(<SecretField id="k" label="Anthropic API key" isSet onCommit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /replace/i }));
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe(''); // fresh entry
  });

  it('cancelling a replace returns to the set state without committing or cancel-reset side effects', async () => {
    const onCommit = vi.fn();
    const onCancelReplace = vi.fn();
    render(
      <SecretField
        id="k"
        label="Anthropic API key"
        isSet
        onCommit={onCommit}
        onCancelReplace={onCancelReplace}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /replace/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep current anthropic api key/i }));
    expect(onCommit).not.toHaveBeenCalled(); // nothing typed, nothing committed
    expect(onCancelReplace).toHaveBeenCalledTimes(1); // draft reset to keep the stored key
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancelling a replace AFTER typing keeps the stored key (reset runs after the blur commit)', async () => {
    const onCommit = vi.fn();
    const onCancelReplace = vi.fn();
    render(
      <SecretField
        id="k"
        label="Anthropic API key"
        isSet
        onCommit={onCommit}
        onCancelReplace={onCancelReplace}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /replace/i }));
    await userEvent.type(screen.getByLabelText('Anthropic API key'), 'sk-new');
    // Clicking Cancel blurs the input first (committing the typed value), THEN runs the cancel reset.
    // The ordering is load-bearing: the reset must win so the net effect keeps the stored key.
    await userEvent.click(screen.getByRole('button', { name: /keep current anthropic api key/i }));
    expect(onCommit).toHaveBeenCalledWith('sk-new');
    expect(onCancelReplace).toHaveBeenCalledTimes(1);
    const commitOrder = onCommit.mock.invocationCallOrder[0] ?? 0;
    const cancelOrder = onCancelReplace.mock.invocationCallOrder[0] ?? 0;
    expect(cancelOrder).toBeGreaterThan(commitOrder); // reset ran AFTER the commit
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument(); // back to Set
  });

  it('does not commit an all-whitespace blur (treated like an empty entry)', async () => {
    const onCommit = vi.fn();
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={onCommit} />);
    await userEvent.type(screen.getByLabelText('Anthropic API key'), '   ');
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not offer a cancel affordance in add mode (no stored key to keep)', () => {
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /keep current/i })).not.toBeInTheDocument();
  });

  it('toggles the entered value between hidden and revealed with a labelled pressed-state button', async () => {
    render(<SecretField id="k" label="Anthropic API key" isSet={false} onCommit={vi.fn()} />);
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    await userEvent.type(input, 'sk-123');
    expect(input.type).toBe('password'); // hidden by default
    const show = screen.getByRole('button', { name: /show anthropic api key/i });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(show);
    expect(input.type).toBe('text'); // revealed
    const hide = screen.getByRole('button', { name: /hide anthropic api key/i });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(hide);
    expect(input.type).toBe('password'); // hidden again
  });

  it('a fresh replace entry starts hidden, never revealing a stored key', async () => {
    render(<SecretField id="k" label="Anthropic API key" isSet onCommit={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /replace/i }));
    const input = screen.getByLabelText('Anthropic API key') as HTMLInputElement;
    expect(input.type).toBe('password'); // masked by default
    expect(input.value).toBe(''); // and empty - the stored key is never shown
  });
});
