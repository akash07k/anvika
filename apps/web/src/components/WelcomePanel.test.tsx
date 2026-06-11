import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '../test/renderWithRouter';
import { WelcomePanel } from './WelcomePanel';

describe('WelcomePanel', () => {
  it('renders the welcome heading and a Settings link, and focuses the heading on mount', async () => {
    renderWithRouter(<WelcomePanel />);
    const heading = await screen.findByRole('heading', { level: 1, name: /welcome to anvika/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
    const link = await screen.findByRole('link', { name: /settings/i });
    expect(link).toHaveAttribute('href', '/settings');
  });
});
