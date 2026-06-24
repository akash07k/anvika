import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ShortcutsView } from './ShortcutsView';
import { renderWithRouter } from '../test/renderWithRouter';
import { useSettingsStore } from '../stores/settingsStore';

afterEach(() => {
  useSettingsStore.setState({ settings: null, status: 'idle' });
});

describe('ShortcutsView', () => {
  it('renders the listing under a page h1 with a Back to chat link', async () => {
    renderWithRouter(<ShortcutsView />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Keyboard shortcuts' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Send message: /)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to chat' })).toBeInTheDocument();
  });
});
