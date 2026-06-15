import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

// shadcn/Radix AlertDialog (ADR 0031) portals its content into the document with real roles, so the
// dialog is in the accessible tree under jsdom (no `{ hidden: true }`). Focus placement and focus
// restoration are covered by the browser-mode spec.

describe('ConfirmDialog', () => {
  const baseProps = {
    open: true,
    title: 'Overwrite settings file?',
    description: 'The file at /d/settings.json is invalid.',
    confirmLabel: 'Overwrite',
  };

  it('exposes an alertdialog named and described by the title and body', () => {
    render(<ConfirmDialog {...baseProps} onConfirm={() => {}} onCancel={() => {}} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Overwrite settings file?');
    expect(dialog).toHaveAccessibleDescription('The file at /d/settings.json is invalid.');
  });

  it('fires onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when the cancel button is clicked, using the default label', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('uses a custom cancel label when provided', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        cancelLabel="Keep file"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Keep file' })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<ConfirmDialog {...baseProps} open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
