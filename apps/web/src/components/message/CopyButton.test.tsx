import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { CopyButton } from './CopyButton';
import type { NotificationEvent } from '../../notifications/events';
import { registerChannel, resetChannels } from '../../notifications/notifier';

const events: NotificationEvent[] = [];
beforeEach(() => {
  events.length = 0;
  registerChannel((e) => events.push(e));
});
afterEach(() => resetChannels());

it('copies the text and emits messageCopied on success', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<CopyButton text="hello world" label="Copy message" />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy message' }));
  expect(writeText).toHaveBeenCalledWith('hello world');
  expect(events).toContainEqual({ type: 'messageCopied' });
});

it('emits messageCopyFailed when the clipboard write rejects', async () => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  render(<CopyButton text="x" label="Copy message" />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy message' }));
  await vi.waitFor(() => expect(events).toContainEqual({ type: 'messageCopyFailed' }));
  expect(events).not.toContainEqual({ type: 'messageCopied' });
});

it('emits messageCopyFailed (never silent) when the Clipboard API is unavailable', async () => {
  // A non-secure origin (plain HTTP on a LAN address) has no `navigator.clipboard`; the button must
  // announce failure rather than throw synchronously and stay silent - silence reads as success.
  Object.assign(navigator, { clipboard: undefined });
  render(<CopyButton text="x" label="Copy message" />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy message' }));
  expect(events).toContainEqual({ type: 'messageCopyFailed' });
  expect(events).not.toContainEqual({ type: 'messageCopied' });
});
