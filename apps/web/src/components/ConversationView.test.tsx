import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { REQUEST_ID_HEADER } from '@anvika/shared/chat';

import { reportClientError } from '../diagnostics/reportClientError';
import { ApiClientError } from '../lib/api-client';
import { renderWithRouter } from '../test/renderWithRouter';
import {
  captured,
  events,
  mockSettings,
  readiness,
  registerConversationViewHooks,
  renderView,
  regenerate,
  sendMessage,
  state,
  stop,
  withChatProviders,
} from './ConversationView.testkit';

vi.mock('@ai-sdk/react', () => ({
  useChat: (options: unknown) => {
    captured.options = options as { onFinish?: (e: unknown) => void };
    return state;
  },
}));

vi.mock('../diagnostics/reportClientError', () => ({ reportClientError: vi.fn() }));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ status: 'ready', settings: mockSettings, hydrate: vi.fn() }),
}));

vi.mock('../hooks/chat/useChatReadiness', () => ({
  useChatReadiness: () => readiness.value,
}));

vi.mock('../diagnostics/logDiag', () => ({ logDiag: vi.fn() }));

// ConversationSettings calls useModels and useConnectionStatuses; stub both with empty data so
// the settings region renders without a real query layer.
vi.mock('../hooks/conversation/useModels', () => ({
  useModels: () => ({ data: [], isPending: false }),
  useConnectionStatuses: () => ({ data: [] }),
}));

vi.mock('../hooks/conversation/useConversationReasoning', () => ({
  useConversationReasoning: () => ({
    override: 'inherit',
    capable: false,
    onEffortChange: vi.fn(),
    beforeSend: () => Promise.resolve(),
    onToggleThinking: vi.fn(),
  }),
}));

import { ConversationView } from './ConversationView';

registerConversationViewHooks();

describe('ConversationView', () => {
  it('renders the conversation heading and messages', () => {
    renderView(<ConversationView />);
    expect(screen.getByRole('heading', { level: 1, name: 'New conversation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assistant' })).toBeInTheDocument();
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('emits messageSent and sends the typed text on submit', async () => {
    renderView(<ConversationView />);
    await userEvent.type(screen.getByLabelText('Message'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Test',
        metadata: expect.objectContaining({ createdAt: expect.any(Number) }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-anvika-request-id': expect.any(String) }),
      }),
    );
    expect(events).toContainEqual({ type: 'messageSent' });
  });

  it('shows a Stop control while generating, stops on click, and returns focus to the composer', async () => {
    state.status = 'streaming';
    renderView(<ConversationView />);
    await userEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });

  it('Shift+Escape with nothing generating speaks a no-op notice instead of stopping', async () => {
    renderView(<ConversationView />); // status is 'ready'
    await userEvent.keyboard('{Shift>}{Escape}{/Shift}');
    expect(stop).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'nothingToStop')).toBe(true);
  });

  it('Shift+Escape while generating stops via the hotkey and speaks no no-op notice', async () => {
    state.status = 'streaming';
    renderView(<ConversationView />);
    await userEvent.keyboard('{Shift>}{Escape}{/Shift}');
    expect(stop).toHaveBeenCalledOnce();
    expect(events.some((e) => e.type === 'nothingToStop')).toBe(false);
  });

  it('announces a generic error once (via the error event, not role=alert) and focuses Retry', () => {
    state.error = new Error('Something went wrong.');
    renderView(<ConversationView />);
    // Single-source error: the event fires from the error field, not a role="alert" region.
    expect(events).toContainEqual({ type: 'error', message: 'Something went wrong.' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
    // A generic (non-no-model) error offers Retry only, and Retry takes focus.
    expect(screen.queryByRole('link', { name: /settings/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
  });

  it('on a 409 conflict announces conversationChangedElsewhere and does NOT take the generic error path', () => {
    state.error = new ApiClientError('conflict', 'Conversation changed elsewhere.', undefined);
    // A conversationId is required for the conflict branch (a draft cannot conflict). The default
    // ConversationView has no id, so render one with an id so `useChatConflict` can branch.
    renderView(<ConversationView conversationId="conv-conflict" />);
    expect(events).toContainEqual({ type: 'conversationChangedElsewhere' });
    // The generic error path (notify error + focus Retry) must NOT run for a conflict.
    expect(events.some((e) => e.type === 'error')).toBe(false);
    // The composer is left intact (not cleared) so the user can resend without a focus trap.
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });

  it('shows a focusable Settings link AND keeps Retry when no model is configured', async () => {
    state.error = new ApiClientError(
      'unconfigured',
      'No model is selected. Choose a model in Settings.',
      undefined,
    );
    // A real router context (not a plain anchor) so the `<Link>` resolves and navigates client-side.
    const { router } = renderWithRouter(withChatProviders(<ConversationView />));
    const link = await screen.findByRole('link', { name: /settings/i });
    expect(link).toHaveAttribute('href', '/settings');
    // The link takes focus so a screen-reader user lands on the path to Settings.
    expect(link).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText(/Choose a model in Settings/)).toBeInTheDocument();
    // It is a real client-side navigation, not an inert anchor: activating it changes the route.
    await userEvent.click(link);
    expect(router.state.location.pathname).toBe('/settings');
  });

  it('Retry regenerates and returns focus to the composer', async () => {
    state.error = new Error('Boom');
    renderView(<ConversationView />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(regenerate).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Message')).toHaveFocus();
  });

  it('reports the clientError with the EXACT in-flight turn id minted on the failing send', async () => {
    // Send first so `handleSend` runs `beginTurn(requestIdRef)` and the ref holds a real 8-hex id --
    // the same `ConversationView` instance must persist across send -> error so the ref survives.
    const { rerender } = renderView(<ConversationView />);
    await userEvent.type(screen.getByLabelText('Message'), 'Test');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    // Capture the correlation id that actually went out on the send header.
    const sendCall = sendMessage.mock.calls.at(0);
    if (!sendCall) throw new Error('expected sendMessage to have been called');
    const sendOptions = sendCall[1] as { headers: Record<string, string> };
    const sentId = sendOptions.headers[REQUEST_ID_HEADER];
    expect(sentId).toMatch(/^[0-9a-f]{8}$/); // a real, non-empty turn id (not '')

    // Now surface an error for that turn on the SAME instance (rerender, not remount).
    const theError = new Error('Something went wrong.');
    state.error = theError;
    rerender(withChatProviders(<ConversationView />));

    // The reported id is the failing turn's id, proving the correlation link -- not empty.
    expect(reportClientError).toHaveBeenCalledWith(theError, sentId);
  });

  it('reports the clientError exactly once per distinct error across re-renders', () => {
    const theError = new Error('Boom once.');
    state.error = theError;
    const { rerender } = renderView(<ConversationView />);
    // Re-render with the SAME error object/message: the effect's `error.message` dedup guard must
    // hold, so neither the diagnostic report nor the announcement fires a second time.
    rerender(withChatProviders(<ConversationView />));
    expect(vi.mocked(reportClientError)).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === 'error')).toHaveLength(1);
  });
});
