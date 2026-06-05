import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../lib/api-client';
import { renderWithRouter } from '../test/renderWithRouter';
import { ChatErrorRegion } from './ChatErrorRegion';

function refs() {
  return {
    settingsLinkRef: createRef<HTMLAnchorElement>(),
    retryRef: createRef<HTMLButtonElement>(),
  };
}

describe('ChatErrorRegion', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(
      <ChatErrorRegion error={undefined} onRetry={vi.fn()} {...refs()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the error text and a Retry button (no role=alert) for a generic error', () => {
    render(
      <ChatErrorRegion error={new Error('Something went wrong.')} onRetry={vi.fn()} {...refs()} />,
    );
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a client-side Settings link for a no-model error', async () => {
    renderWithRouter(
      <ChatErrorRegion
        error={new ApiClientError('unconfigured', 'Choose a model in Settings.', undefined)}
        onRetry={vi.fn()}
        {...refs()}
      />,
    );
    expect(await screen.findByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('shows a navigable (not spoken) reference line for a mid-stream error when a turn id is present', () => {
    render(
      <ChatErrorRegion
        error={new Error('boom')}
        requestId="1a2b3c4d"
        onRetry={vi.fn()}
        {...refs()}
      />,
    );
    expect(screen.getByText(/Reference: 1a2b3c4d/)).toBeInTheDocument();
  });

  it('shows no reference line for an HTTP (ApiClientError) error, even with a turn id', () => {
    render(
      <ChatErrorRegion
        error={new ApiClientError('provider-error', 'Upstream failed.', undefined)}
        requestId="1a2b3c4d"
        onRetry={vi.fn()}
        {...refs()}
      />,
    );
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });

  it('shows no reference line when the turn id is empty', () => {
    render(
      <ChatErrorRegion error={new Error('boom')} requestId="" onRetry={vi.fn()} {...refs()} />,
    );
    expect(screen.queryByText(/Reference:/)).toBeNull();
  });
});
