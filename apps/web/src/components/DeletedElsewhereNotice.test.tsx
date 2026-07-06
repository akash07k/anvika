import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '../test/renderWithRouter';
import { DeletedElsewhereNotice } from './DeletedElsewhereNotice';

describe('DeletedElsewhereNotice', () => {
  it('focuses the "Conversation deleted" heading on mount so the SR user lands on the explanation', async () => {
    renderWithRouter(<DeletedElsewhereNotice />);
    const heading = await screen.findByRole('heading', { level: 1, name: /conversation deleted/i });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveFocus();
  });

  it('is NOT a live region (no aria-live, not role="alert"), so it never interrupts mid-task', async () => {
    renderWithRouter(<DeletedElsewhereNotice />);
    const region = await screen.findByRole('region', { name: /conversation deleted/i });
    expect(region).not.toHaveAttribute('aria-live');
    expect(region).not.toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers a "Start a new conversation" link to the home route', async () => {
    renderWithRouter(<DeletedElsewhereNotice />);
    const link = await screen.findByRole('link', { name: /start a new conversation/i });
    expect(link).toHaveAttribute('href', '/');
  });
});
