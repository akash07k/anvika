import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RenameConversationField } from './RenameConversationField';

describe('RenameConversationField', () => {
  it('prefills the input with the current title and labels it accessibly', () => {
    render(
      <RenameConversationField currentTitle="My chat" onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );
    const input = screen.getByRole('textbox', { name: 'Rename conversation' });
    expect(input).toHaveValue('My chat');
  });

  it('submits the trimmed title on Enter (form submit)', () => {
    const onSubmit = vi.fn();
    render(<RenameConversationField currentTitle="Old" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Rename conversation' });
    fireEvent.change(input, { target: { value: '  New title  ' } });
    fireEvent.submit(input);
    expect(onSubmit).toHaveBeenCalledWith('New title');
  });

  it('does not submit an empty or whitespace-only title and disables Save', () => {
    const onSubmit = vi.fn();
    render(<RenameConversationField currentTitle="Old" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Rename conversation' });
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.submit(input);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels on Escape and on the Cancel button', () => {
    const onCancel = vi.fn();
    render(<RenameConversationField currentTitle="Old" onSubmit={vi.fn()} onCancel={onCancel} />);
    const input = screen.getByRole('textbox', { name: 'Rename conversation' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
