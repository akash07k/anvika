import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useSettingsStore } from '../stores/settingsStore';

afterEach(() => {
  useSettingsStore.setState({ settings: null, status: 'idle' });
});

describe('KeyboardShortcuts', () => {
  it('lists non-quick-nav actions as "Action: Key" list items', () => {
    render(<KeyboardShortcuts />);
    // The list renders no heading of its own; each surface provides one.
    expect(screen.queryByRole('heading')).toBeNull();
    // 15 non-quick-nav actions + 3 collapsed quick-nav rows (message + conversation + pinned).
    expect(screen.getAllByRole('listitem')).toHaveLength(18);
    expect(screen.getByText(/^Send message: (Ctrl|Cmd)\+Enter$/)).toBeInTheDocument();
    expect(screen.getByText('Stop generating: Shift+Esc')).toBeInTheDocument();
    expect(screen.getByText('Open keyboard shortcuts: Alt+/')).toBeInTheDocument();
    expect(screen.getByText('Toggle thinking: Alt+T')).toBeInTheDocument();
    expect(screen.getByText('Jump to the latest thinking: Alt+R')).toBeInTheDocument();
    expect(screen.getByText('New conversation: Alt+N')).toBeInTheDocument();
    expect(screen.getByText('New conversation with options: Alt+Shift+N')).toBeInTheDocument();
    expect(screen.getByText('Edit the most recent message: Ctrl+Up')).toBeInTheDocument();
    expect(screen.getByText('Focus the conversation list: Alt+Shift+C')).toBeInTheDocument();
    expect(screen.getByText('Focus the pinned conversations: Ctrl+Alt+C')).toBeInTheDocument();
    expect(
      screen.getByText('Pin or unpin the current conversation: Ctrl+Alt+P'),
    ).toBeInTheDocument();
  });

  it('collapses the ten quick-nav actions into one item', () => {
    render(<KeyboardShortcuts />);
    expect(
      screen.getByText(
        'Read a recent message: Alt+1 (most recent) through Alt+0 (tenth most recent)',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Read the 2nd most recent message/)).not.toBeInTheDocument();
  });

  it('collapses the ten conversation quick-nav actions into one item', () => {
    render(<KeyboardShortcuts />);
    expect(
      screen.getByText(
        'Switch to a recent conversation: Alt+Shift+1 (most recent) through Alt+Shift+0 (tenth most recent)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Switch to the 2nd most recent conversation/),
    ).not.toBeInTheDocument();
  });

  it('collapses the ten pinned conversation quick-nav actions into one item', () => {
    render(<KeyboardShortcuts />);
    expect(
      screen.getByText(
        'Switch to a recent pinned conversation: Ctrl+Alt+1 (most recent) through Ctrl+Alt+0 (tenth most recent)',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Switch to the 2nd most recent pinned conversation/),
    ).not.toBeInTheDocument();
  });

  it('reflects a user override binding from the resolved keymap', () => {
    useSettingsStore.setState({
      status: 'ready',
      settings: { hotkeyBindings: { stop: 'alt+x' } } as never,
    });
    render(<KeyboardShortcuts />);
    expect(screen.getByText('Stop generating: Alt+X')).toBeInTheDocument();
  });
});
