import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSettingsStore } from '../stores/settingsStore';

import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';

afterEach(() => {
  useSettingsStore.setState({ settings: null, status: 'idle' });
});

// shadcn/Radix Dialog (ADR 0031) portals its content into the document, so the dialog renders into
// the accessible tree under jsdom (no `{ hidden: true }` needed). The focus trap and focus restoration
// are covered by the browser-mode spec; these jsdom specs cover rendering, the accessible name, and
// the dismissal handlers.

describe('KeyboardShortcutsDialog', () => {
  it('renders the listing inside a titled dialog when open', () => {
    render(<KeyboardShortcutsDialog open onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Keyboard shortcuts');
    expect(screen.getByText(/^Send message: /)).toBeInTheDocument();
    expect(screen.getByText('Open keyboard shortcuts: Alt+/')).toBeInTheDocument();
  });

  it('does not render the dialog when closed', () => {
    render(<KeyboardShortcutsDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fires onClose when dismissed via Escape', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog open onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the built-in Close button', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
