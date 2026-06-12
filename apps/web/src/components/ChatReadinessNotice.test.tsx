import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '../test/renderWithRouter';
import { ChatReadinessNotice } from './ChatReadinessNotice';

describe('ChatReadinessNotice', () => {
  it('shows a polite checking status while loading', () => {
    // The loading branch renders only an <output> (no Link), so no router is needed.
    render(<ChatReadinessNotice readiness="loading" />);
    expect(screen.getByText(/checking your model/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a recoverable notice with a Settings link when the model is unavailable', async () => {
    // This branch renders a TanStack Router <Link>, so it needs the router (which mounts async).
    renderWithRouter(<ChatReadinessNotice readiness="model-unavailable" />);
    expect(await screen.findByText(/isn't available right now/i)).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /open settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('renders nothing when ready', () => {
    render(<ChatReadinessNotice readiness="ready" />);
    expect(screen.queryByText(/checking your model/i)).toBeNull();
    expect(screen.queryByText(/isn't available right now/i)).toBeNull();
  });

  it('renders nothing when unconfigured (the WelcomePanel owns that state)', () => {
    render(<ChatReadinessNotice readiness="unconfigured" />);
    expect(screen.queryByText(/checking your model/i)).toBeNull();
    expect(screen.queryByText(/isn't available right now/i)).toBeNull();
  });
});
