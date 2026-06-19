import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MessageActionsMenu } from './MessageActionsMenu';

describe('MessageActionsMenu', () => {
  it('renders nothing when no item applies (draft user row: onBranch and onEdit undefined)', () => {
    const { container } = render(
      <MessageActionsMenu
        idBase="message-a1"
        triggerLabel="Actions for your message"
        messageRole="user"
        isStreaming={false}
        onBranch={undefined}
        onEdit={undefined}
      />,
    );
    // The whole menu - trigger included - is absent so a draft never shows an empty menu.
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole('button', { name: 'Actions for your message' }),
    ).not.toBeInTheDocument();
  });

  it('renders the trigger with the supplied accessible name when an item is available', () => {
    render(
      <MessageActionsMenu
        idBase="message-a1"
        triggerLabel="Actions for Assistant's message"
        messageRole="assistant"
        isStreaming={false}
        onBranch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: "Actions for Assistant's message" }),
    ).toBeInTheDocument();
  });

  it('renders nothing for a user row even when only onRegenerate is provided (role-filtered)', () => {
    const { container } = render(
      <MessageActionsMenu
        idBase="message-u1"
        triggerLabel="Actions for your message"
        messageRole="user"
        isStreaming={false}
        onRegenerate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an assistant row even when only onEdit is provided (role-filtered)', () => {
    const { container } = render(
      <MessageActionsMenu
        idBase="message-a1"
        triggerLabel="Actions for Assistant's message"
        messageRole="assistant"
        isStreaming={false}
        onEdit={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
